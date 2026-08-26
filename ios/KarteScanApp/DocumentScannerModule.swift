import Foundation
import UIKit
import VisionKit
import Vision
import NaturalLanguage
import AVFoundation

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

  // MARK: - 無音・手動撮影（映像フレームを取得するためシャッター音が鳴らない）
  @objc
  func scanManual(_ resolve: @escaping RCTPromiseResolveBlock,
                  rejecter reject: @escaping RCTPromiseRejectBlock) {
    self.resolve = resolve
    self.reject = reject

    DispatchQueue.main.async {
      guard let rootVC = UIApplication.shared.windows.first?.rootViewController else {
        reject("NO_VC", "ViewControllerが取得できません", nil)
        return
      }
      let vc = ManualCaptureViewController()
      vc.modalPresentationStyle = .fullScreen
      vc.onCancel = { [weak self] in
        self?.reject?("CANCELLED", "スキャンがキャンセルされました", nil)
      }
      vc.onFinish = { [weak self] images in
        self?.processCapturedImages(images)
      }
      rootVC.present(vc, animated: true)
    }
  }

  // 撮影した画像群をOCR・NER処理して結果を返す（scanと同じ pages 形式）
  private func processCapturedImages(_ images: [UIImage]) {
    let limited = Array(images.prefix(10))
    guard !limited.isEmpty else {
      self.resolve?(["pageCount": 0, "totalScanned": 0, "pages": []])
      return
    }

    var pageTexts = [[String]](repeating: [], count: limited.count)
    var pageImages = [String](repeating: "", count: limited.count)
    let group = DispatchGroup()
    let syncQueue = DispatchQueue(label: "manual.ocr.results")

    for (i, image) in limited.enumerated() {
      pageImages[i] = imageToBase64(image)
      group.enter()
      performOCR(on: image) { texts in
        syncQueue.async {
          pageTexts[i] = texts
          group.leave()
        }
      }
    }

    group.notify(queue: .main) {
      var pages: [[String: Any]] = []
      for i in 0..<limited.count {
        let text = pageTexts[i].joined(separator: "\n")
        let entities = self.extractNamedEntities(from: text)
        pages.append([
          "image": pageImages[i],
          "texts": pageTexts[i],
          "personNames": entities.personNames,
          "placeNames": entities.placeNames,
          "organizationNames": entities.organizationNames,
        ])
      }
      self.resolve?([
        "pageCount": limited.count,
        "totalScanned": images.count,
        "pages": pages,
      ])
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

  // 一度に処理する最大書類数
  private static let maxPages = 10

  func documentCameraViewController(_ controller: VNDocumentCameraViewController,
                                    didFinishWith scan: VNDocumentCameraScan) {
    controller.dismiss(animated: true)

    let totalScanned = scan.pageCount
    let pageCount = min(totalScanned, DocumentScannerModule.maxPages)

    // 1枚=1書類として、ページごとにOCR結果と画像を保持する
    var pageTexts = [[String]](repeating: [], count: pageCount)
    var pageImages = [String](repeating: "", count: pageCount)
    // 複数ページのOCR完了は並行して返るため、配列書き込みを直列化する
    let syncQueue = DispatchQueue(label: "com.oyama.kartescanapp.ocrResults")
    let group = DispatchGroup()

    for i in 0..<pageCount {
      let image = scan.imageOfPage(at: i)
      let base64 = imageToBase64(image)

      group.enter()
      performOCR(on: image) { texts in
        syncQueue.async {
          pageTexts[i] = texts
          pageImages[i] = base64
          group.leave()
        }
      }
    }

    group.notify(queue: .main) {
      // ページごとに個別のNERを行い、1書類分のペイロードにまとめる
      var pages: [[String: Any]] = []
      for i in 0..<pageCount {
        let fullText = pageTexts[i].joined(separator: "\n")
        let entities = self.extractNamedEntities(from: fullText)
        pages.append([
          "image": pageImages[i],
          "texts": pageTexts[i],
          "personNames": entities.personNames,
          "placeNames": entities.placeNames,
          "organizationNames": entities.organizationNames,
        ])
      }
      let result: [String: Any] = [
        "pageCount": pageCount,
        "totalScanned": totalScanned,
        "pages": pages,
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

// MARK: - 無音・手動撮影用カメラ画面
// AVCaptureVideoDataOutput から映像の1フレームを取り込むため、写真撮影の
// シャッター音が鳴らない。用紙の自動枠検出は行わず、ユーザーが任意のタイミングで撮る。
final class ManualCaptureViewController: UIViewController,
  AVCaptureVideoDataOutputSampleBufferDelegate {

  var onFinish: (([UIImage]) -> Void)?
  var onCancel: (() -> Void)?

  private let maxPages = 10
  private let session = AVCaptureSession()
  private let videoOutput = AVCaptureVideoDataOutput()
  private let sampleQueue = DispatchQueue(label: "manual.capture.video")
  private let ciContext = CIContext()
  private var previewLayer: AVCaptureVideoPreviewLayer?

  private var captured: [UIImage] = []
  private var wantCapture = false
  private var finished = false

  private let counterLabel = UILabel()
  private let shutterButton = UIButton(type: .custom)
  private let doneButton = UIButton(type: .system)
  private let cancelButton = UIButton(type: .system)

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .black
    setupUI()
    requestPermissionAndConfigure()
  }

  private func requestPermissionAndConfigure() {
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized:
      configureSession()
    case .notDetermined:
      AVCaptureDevice.requestAccess(for: .video) { granted in
        DispatchQueue.main.async {
          if granted { self.configureSession() } else { self.cancel() }
        }
      }
    default:
      cancel()
    }
  }

  private func configureSession() {
    session.beginConfiguration()
    session.sessionPreset =
      session.canSetSessionPreset(.hd1920x1080) ? .hd1920x1080 : .high

    guard
      let device = AVCaptureDevice.default(
        .builtInWideAngleCamera, for: .video, position: .back),
      let input = try? AVCaptureDeviceInput(device: device),
      session.canAddInput(input)
    else {
      session.commitConfiguration()
      return
    }
    session.addInput(input)

    videoOutput.videoSettings = [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
    ]
    videoOutput.alwaysDiscardsLateVideoFrames = true
    videoOutput.setSampleBufferDelegate(self, queue: sampleQueue)
    if session.canAddOutput(videoOutput) { session.addOutput(videoOutput) }
    if let conn = videoOutput.connection(with: .video),
      conn.isVideoOrientationSupported {
      conn.videoOrientation = .portrait
    }
    session.commitConfiguration()

    let preview = AVCaptureVideoPreviewLayer(session: session)
    preview.videoGravity = .resizeAspectFill
    preview.frame = view.bounds
    view.layer.insertSublayer(preview, at: 0)
    previewLayer = preview

    sampleQueue.async { self.session.startRunning() }
  }

  private func setupUI() {
    counterLabel.textColor = .white
    counterLabel.font = .boldSystemFont(ofSize: 16)
    counterLabel.textAlignment = .center
    counterLabel.text = "0 / \(maxPages)"
    counterLabel.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(counterLabel)

    shutterButton.backgroundColor = .white
    shutterButton.layer.cornerRadius = 36
    shutterButton.layer.borderWidth = 4
    shutterButton.layer.borderColor = UIColor(white: 0.8, alpha: 1).cgColor
    shutterButton.translatesAutoresizingMaskIntoConstraints = false
    shutterButton.addTarget(self, action: #selector(onShutter), for: .touchUpInside)
    view.addSubview(shutterButton)

    cancelButton.setTitle("キャンセル", for: .normal)
    cancelButton.setTitleColor(.white, for: .normal)
    cancelButton.titleLabel?.font = .systemFont(ofSize: 16)
    cancelButton.translatesAutoresizingMaskIntoConstraints = false
    cancelButton.addTarget(self, action: #selector(onCancelTap), for: .touchUpInside)
    view.addSubview(cancelButton)

    doneButton.setTitle("完了", for: .normal)
    doneButton.setTitleColor(.white, for: .normal)
    doneButton.titleLabel?.font = .boldSystemFont(ofSize: 17)
    doneButton.translatesAutoresizingMaskIntoConstraints = false
    doneButton.addTarget(self, action: #selector(onDone), for: .touchUpInside)
    view.addSubview(doneButton)

    let guide = view.safeAreaLayoutGuide
    NSLayoutConstraint.activate([
      counterLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      counterLabel.topAnchor.constraint(equalTo: guide.topAnchor, constant: 16),

      shutterButton.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      shutterButton.bottomAnchor.constraint(equalTo: guide.bottomAnchor, constant: -28),
      shutterButton.widthAnchor.constraint(equalToConstant: 72),
      shutterButton.heightAnchor.constraint(equalToConstant: 72),

      cancelButton.leadingAnchor.constraint(equalTo: guide.leadingAnchor, constant: 20),
      cancelButton.centerYAnchor.constraint(equalTo: shutterButton.centerYAnchor),

      doneButton.trailingAnchor.constraint(equalTo: guide.trailingAnchor, constant: -20),
      doneButton.centerYAnchor.constraint(equalTo: shutterButton.centerYAnchor),
    ])
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    previewLayer?.frame = view.bounds
  }

  @objc private func onShutter() { wantCapture = true }

  @objc private func onDone() { finish() }

  @objc private func onCancelTap() { cancel() }

  private func finish() {
    if finished { return }
    finished = true
    sampleQueue.async { self.session.stopRunning() }
    let images = captured
    let cb = onFinish
    dismiss(animated: true) { cb?(images) }
  }

  private func cancel() {
    if finished { return }
    finished = true
    sampleQueue.async { self.session.stopRunning() }
    let cb = onCancel
    dismiss(animated: true) { cb?() }
  }

  func captureOutput(_ output: AVCaptureOutput,
                     didOutput sampleBuffer: CMSampleBuffer,
                     from connection: AVCaptureConnection) {
    guard wantCapture else { return }
    wantCapture = false
    guard let pixel = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
    let ci = CIImage(cvPixelBuffer: pixel)
    guard let cg = ciContext.createCGImage(ci, from: ci.extent) else { return }
    let image = UIImage(cgImage: cg)

    DispatchQueue.main.async {
      self.captured.append(image)
      self.counterLabel.text = "\(self.captured.count) / \(self.maxPages)"
      if self.captured.count >= self.maxPages { self.finish() }
    }
  }
}
