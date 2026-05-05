import Foundation
import UIKit
import VisionKit
import Vision

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

      let texts = observations.compactMap { obs -> String? in
        obs.topCandidates(1).first?.string
      }
      completion(texts)
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
      let result: [String: Any] = [
        "texts": allTexts,
        "pageImages": pageImages,
        "pageCount": scan.pageCount
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
