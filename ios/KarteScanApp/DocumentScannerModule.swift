import Foundation
import UIKit
import VisionKit
import Vision
import NaturalLanguage

// MARK: - DocumentScannerModule
@objc(DocumentScannerModule)
class DocumentScannerModule: NSObject {

  private var resolve: RCTPromiseResolveBlock?
  private var reject: RCTPromiseRejectBlock?

  @objc
  func scan(_ resolve: @escaping RCTPromiseResolveBlock,
            rejecter reject: @escaping RCTPromiseRejectBlock) {
    self.resolve = resolve
    self.reject = reject

    DispatchQueue.main.async {
      guard VNDocumentCameraViewController.isSupported else {
        reject("UNSUPPORTED", "このデバイスはドキュメントスキャンに対応していません", nil)
        return
      }

      let scanner = VNDocumentCameraViewController()
      scanner.delegate = self

      guard let rootVC = UIApplication.shared.windows.first?.rootViewController else {
        reject("NO_VC", "ViewControllerが取得できません", nil)
        return
      }
      rootVC.present(scanner, animated: true)
    }
  }

  // MARK: - OCR処理
  private func performOCR(on image: UIImage, completion: @escaping ([String]) -> Void) {
    guard let cgImage = image.cgImage else {
      completion([])
      return
    }

    let request = VNRecognizeTextRequest { request, error in
      guard error == nil,
            let observations = request.results as? [VNRecognizedTextObservation] else {
        completion([])
        return
      }

      // 各observationの文字列と座標(boundingBox)を取り出す
      let frags: [(text: String, box: CGRect)] = observations.compactMap { obs in
        guard let s = obs.topCandidates(1).first?.string else { return nil }
        return (s, obs.boundingBox)
      }

      completion(self.reconstructLines(from: frags))
    }

    // 日本語 + 英語を高精度で認識
    request.recognitionLanguages = ["ja-JP", "en-US"]
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    request.minimumTextHeight = 0.01

    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    DispatchQueue.global(qos: .userInitiated).async {
      try? handler.perform([request])
    }
  }

  // MARK: - boundingBoxから視覚的な行を再構成
  // Visionはラベルと値が全角スペース等で離れていると別observationに分割し、
  // 返却順が列優先になって「ラベル群→値群」に崩れることがある。
  // 縦位置(Y)が近いフラグメントを同一行にまとめ、横位置(X)順に並べ直すことで
  // 「患者氏名 阿部 久美子」のように本来の1行を復元する。
  // 注: Visionの座標系は左下原点・正規化(0〜1)、Yは上ほど大きい。
  private func reconstructLines(from frags: [(text: String, box: CGRect)]) -> [String] {
    guard !frags.isEmpty else { return [] }

    // 上から下へ（midYの降順）
    let sorted = frags.sorted { $0.box.midY > $1.box.midY }

    var rows: [[(text: String, box: CGRect)]] = []
    for f in sorted {
      if let last = rows.last, let ref = last.first {
        // 同一行判定: 縦位置の差が行高さの6割未満なら同じ行とみなす
        let tol = max(ref.box.height, f.box.height) * 0.6
        if abs(f.box.midY - ref.box.midY) < tol {
          rows[rows.count - 1].append(f)
          continue
        }
      }
      rows.append([f])
    }

    // 各行を左→右（minXの昇順）に並べ、スペース区切りで結合
    return rows.map { row in
      row.sorted { $0.box.minX < $1.box.minX }
        .map { $0.text }
        .joined(separator: " ")
    }
  }

  // MARK: - NLTaggerで人名・地名候補を抽出
  private func extractNamedEntities(from text: String) -> (personNames: [String], placeNames: [String], organizationNames: [String]) {
    let tagger = NLTagger(tagSchemes: [.nameType])
    tagger.string = text

    var personNames: [String] = []
    var placeNames: [String] = []
    var organizationNames: [String] = []
    let options: NLTagger.Options = [.omitWhitespace, .omitPunctuation, .joinNames]

    tagger.enumerateTags(in: text.startIndex..<text.endIndex,
                         unit: .word,
                         scheme: .nameType,
                         options: options) { tag, range in
      let value = String(text[range]).trimmingCharacters(in: .whitespaces)
      guard !value.isEmpty else { return true }
      if tag == .personalName, !personNames.contains(value) {
        personNames.append(value)
      } else if tag == .placeName, !placeNames.contains(value) {
        placeNames.append(value)
      } else if tag == .organizationName, !organizationNames.contains(value) {
        organizationNames.append(value)
      }
      return true
    }
    return (personNames, placeNames, organizationNames)
  }

  // MARK: - 画像をBase64へ変換
  private func imageToBase64(_ image: UIImage) -> String {
    guard let data = image.jpegData(compressionQuality: 0.9) else { return "" }
    return data.base64EncodedString()
  }

  @objc
  static func requiresMainQueueSetup() -> Bool { return true }
}

// MARK: - VNDocumentCameraViewControllerDelegate
extension DocumentScannerModule: VNDocumentCameraViewControllerDelegate {

  func documentCameraViewController(_ controller: VNDocumentCameraViewController,
                                    didFinishWith scan: VNDocumentCameraScan) {
    controller.dismiss(animated: true)

    var allTexts: [String] = []
    var pageImages: [String] = []
    let group = DispatchGroup()

    for i in 0..<scan.pageCount {
      let image = scan.imageOfPage(at: i)
      pageImages.append(imageToBase64(image))

      group.enter()
      performOCR(on: image) { texts in
        allTexts.append(contentsOf: texts)
        group.leave()
      }
    }

    group.notify(queue: .main) {
      let fullText = allTexts.joined(separator: "\n")
      let entities = self.extractNamedEntities(from: fullText)
      let result: [String: Any] = [
        "texts": allTexts,
        "pageImages": pageImages,
        "pageCount": scan.pageCount,
        "personNames": entities.personNames,
        "placeNames": entities.placeNames,
        "organizationNames": entities.organizationNames,
      ]
      self.resolve?(result)
    }
  }

  func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
    controller.dismiss(animated: true)
    reject?("CANCELLED", "スキャンがキャンセルされました", nil)
  }

  func documentCameraViewController(_ controller: VNDocumentCameraViewController,
                                    didFailWithError error: Error) {
    controller.dismiss(animated: true)
    reject?("SCAN_ERROR", error.localizedDescription, error)
  }
}
