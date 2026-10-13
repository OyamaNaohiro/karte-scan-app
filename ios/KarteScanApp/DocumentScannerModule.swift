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
// ピンぼけ対策: 近距離優先の連続AF、タップでピント合わせ、シャッター後はピント調整の
// 完了を待ってから数フレームを取り込み、最も鮮明な1枚を採用する（いずれも無音）。
final class ManualCaptureViewController: UIViewController,
  AVCaptureVideoDataOutputSampleBufferDelegate, UIGestureRecognizerDelegate {

  var onFinish: (([UIImage]) -> Void)?
  var onCancel: (() -> Void)?

  private let maxPages = 10
  private let session = AVCaptureSession()
  private let videoOutput = AVCaptureVideoDataOutput()
  private let sampleQueue = DispatchQueue(label: "manual.capture.video")
  private let ciContext = CIContext()
  private var previewLayer: AVCaptureVideoPreviewLayer?
  private var device: AVCaptureDevice?

  // 取り込み状態（sampleQueue 上でのみ参照する）
  private enum CaptureState {
    case idle
    case waitingFocus(since: CFTimeInterval)
    case collecting
  }
  private var captureState = CaptureState.idle
  private var bestPixel: CVPixelBuffer?
  private var bestScore = -1.0
  private var framesCollected = 0
  // ピント調整を待つ上限（秒）と、鮮明さを比べるフレーム数
  private let focusWaitTimeout: CFTimeInterval = 1.0
  private let framesToCompare = 6

  private var captured: [UIImage] = []
  private var shutterBusy = false
  private var finished = false

  private let counterLabel = UILabel()
  private let shutterButton = UIButton(type: .custom)
  private let doneButton = UIButton(type: .system)
  private let cancelButton = UIButton(type: .system)
  private let flashView = UIView()
  private let thumbnailView = UIImageView()
  private let focusIndicator = UIView()
  private let haptic = UIImpactFeedbackGenerator(style: .medium)

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .black
    setupUI()
    haptic.prepare()
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
    self.device = device
    configureFocus(device)

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

  // 書類撮影向けのピント・露出設定（近距離優先の連続AF）
  private func configureFocus(_ device: AVCaptureDevice) {
    guard (try? device.lockForConfiguration()) != nil else { return }
    if device.isAutoFocusRangeRestrictionSupported {
      device.autoFocusRangeRestriction = .near
    }
    // スムーズAFは動画向けで合焦が遅いため切る
    if device.isSmoothAutoFocusSupported {
      device.isSmoothAutoFocusEnabled = false
    }
    if device.isFocusModeSupported(.continuousAutoFocus) {
      device.focusMode = .continuousAutoFocus
    }
    if device.isExposureModeSupported(.continuousAutoExposure) {
      device.exposureMode = .continuousAutoExposure
    }
    // タップでピントを固定した後、カメラが動いたら連続AFに戻すため
    device.isSubjectAreaChangeMonitoringEnabled = true
    device.unlockForConfiguration()

    NotificationCenter.default.addObserver(
      self, selector: #selector(onSubjectAreaChange),
      name: .AVCaptureDeviceSubjectAreaDidChange, object: device)
  }

  // 指定点（デバイス座標 0〜1）にピント・露出を合わせる
  private func focus(at point: CGPoint, mode: AVCaptureDevice.FocusMode) {
    guard let device = device, (try? device.lockForConfiguration()) != nil else { return }
    if device.isFocusPointOfInterestSupported && device.isFocusModeSupported(mode) {
      device.focusPointOfInterest = point
      device.focusMode = mode
    }
    if device.isExposurePointOfInterestSupported
      && device.isExposureModeSupported(.continuousAutoExposure) {
      device.exposurePointOfInterest = point
      device.exposureMode = .continuousAutoExposure
    }
    device.unlockForConfiguration()
  }

  @objc private func onSubjectAreaChange() {
    focus(at: CGPoint(x: 0.5, y: 0.5), mode: .continuousAutoFocus)
  }

  @objc private func onPreviewTap(_ gesture: UITapGestureRecognizer) {
    guard let preview = previewLayer else { return }
    let layerPoint = gesture.location(in: view)
    let devicePoint = preview.captureDevicePointConverted(fromLayerPoint: layerPoint)
    focus(at: devicePoint, mode: .autoFocus)
    showFocusIndicator(at: layerPoint)
  }

  // ボタン上のタップはピント合わせにしない
  func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
                         shouldReceive touch: UITouch) -> Bool {
    return !(touch.view is UIControl)
  }

  private func showFocusIndicator(at point: CGPoint) {
    focusIndicator.layer.removeAllAnimations()
    focusIndicator.center = point
    focusIndicator.alpha = 1
    focusIndicator.transform = CGAffineTransform(scaleX: 1.4, y: 1.4)
    UIView.animate(withDuration: 0.2) { self.focusIndicator.transform = .identity }
    UIView.animate(withDuration: 0.3, delay: 0.9, options: [], animations: {
      self.focusIndicator.alpha = 0
    })
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

    // 直近に撮影した画像のサムネイル（撮れたことの確認用）
    thumbnailView.contentMode = .scaleAspectFill
    thumbnailView.clipsToBounds = true
    thumbnailView.layer.cornerRadius = 6
    thumbnailView.layer.borderWidth = 2
    thumbnailView.layer.borderColor = UIColor.white.cgColor
    thumbnailView.isHidden = true
    thumbnailView.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(thumbnailView)

    // 撮影の瞬間に光らせる白いフラッシュ（操作は透過）
    flashView.backgroundColor = .white
    flashView.alpha = 0
    flashView.isUserInteractionEnabled = false
    flashView.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(flashView)

    // タップした位置に出すピント枠
    focusIndicator.frame = CGRect(x: 0, y: 0, width: 72, height: 72)
    focusIndicator.layer.borderColor = UIColor.systemYellow.cgColor
    focusIndicator.layer.borderWidth = 2
    focusIndicator.alpha = 0
    focusIndicator.isUserInteractionEnabled = false
    view.addSubview(focusIndicator)

    let tap = UITapGestureRecognizer(target: self, action: #selector(onPreviewTap(_:)))
    tap.delegate = self
    view.addGestureRecognizer(tap)

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

      thumbnailView.trailingAnchor.constraint(equalTo: guide.trailingAnchor, constant: -16),
      thumbnailView.topAnchor.constraint(equalTo: counterLabel.bottomAnchor, constant: 12),
      thumbnailView.widthAnchor.constraint(equalToConstant: 54),
      thumbnailView.heightAnchor.constraint(equalToConstant: 72),

      flashView.topAnchor.constraint(equalTo: view.topAnchor),
      flashView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
      flashView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      flashView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
    ])
  }

  // 撮影時の視覚フィードバック（白フラッシュ＋サムネイル更新＋シャッターボタンの拡縮）
  private func showCaptureFeedback(_ image: UIImage) {
    thumbnailView.image = image
    thumbnailView.isHidden = false

    flashView.alpha = 0.85
    UIView.animate(withDuration: 0.28) { self.flashView.alpha = 0 }

    UIView.animate(
      withDuration: 0.08,
      animations: { self.shutterButton.transform = CGAffineTransform(scaleX: 0.85, y: 0.85) },
      completion: { _ in
        UIView.animate(withDuration: 0.12) {
          self.shutterButton.transform = .identity
        }
      })

    // サムネイルをふわっと出す
    thumbnailView.transform = CGAffineTransform(scaleX: 0.7, y: 0.7)
    UIView.animate(withDuration: 0.2) { self.thumbnailView.transform = .identity }
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    previewLayer?.frame = view.bounds
  }

  @objc private func onShutter() {
    guard !shutterBusy, !finished, captured.count < maxPages else { return }
    setShutterBusy(true)
    let now = CACurrentMediaTime()
    sampleQueue.async { self.captureState = .waitingFocus(since: now) }
  }

  // 取り込み中はシャッターを薄くして連打を防ぐ
  private func setShutterBusy(_ busy: Bool) {
    shutterBusy = busy
    shutterButton.alpha = busy ? 0.5 : 1
  }

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
    // ピント調整中はフレームを見送る（上限時間を過ぎたら諦めて取り込む）
    if case .waitingFocus(let since) = captureState {
      if let d = device, d.isAdjustingFocus,
        CACurrentMediaTime() - since < focusWaitTimeout {
        return
      }
      captureState = .collecting
      bestPixel = nil
      bestScore = -1
      framesCollected = 0
    }
    guard case .collecting = captureState,
      let pixel = CMSampleBufferGetImageBuffer(sampleBuffer)
    else { return }

    // 数フレームのうち最も鮮明なもの（手ブレ・ピンぼけが少ないもの）を残す
    let score = sharpness(of: pixel)
    if score > bestScore {
      bestScore = score
      bestPixel = pixel
    }
    framesCollected += 1
    guard framesCollected >= framesToCompare, let best = bestPixel else { return }
    captureState = .idle
    bestPixel = nil

    let ci = CIImage(cvPixelBuffer: best)
    guard let cg = ciContext.createCGImage(ci, from: ci.extent) else {
      DispatchQueue.main.async { self.setShutterBusy(false) }
      return
    }
    let image = UIImage(cgImage: cg)

    DispatchQueue.main.async {
      self.setShutterBusy(false)
      if self.finished { return }
      self.captured.append(image)
      self.counterLabel.text = "\(self.captured.count) / \(self.maxPages)"
      self.haptic.impactOccurred()
      self.haptic.prepare()
      self.showCaptureFeedback(image)
      if self.captured.count >= self.maxPages { self.finish() }
    }
  }

  // 鮮明さの指標: 中央部の輝度に対するラプラシアンの分散（大きいほどシャープ）
  private func sharpness(of pixel: CVPixelBuffer) -> Double {
    CVPixelBufferLockBaseAddress(pixel, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(pixel, .readOnly) }
    guard let base = CVPixelBufferGetBaseAddress(pixel) else { return 0 }
    let width = CVPixelBufferGetWidth(pixel)
    let height = CVPixelBufferGetHeight(pixel)
    let rowBytes = CVPixelBufferGetBytesPerRow(pixel)
    let ptr = base.assumingMemoryBound(to: UInt8.self)

    // BGRA → 輝度（整数近似）
    func luma(_ x: Int, _ y: Int) -> Int {
      let p = ptr + y * rowBytes + x * 4
      return (Int(p[0]) * 29 + Int(p[1]) * 150 + Int(p[2]) * 77) >> 8
    }

    // 中央60%の範囲を2ピクセルおきに調べる（処理を軽くするため）
    let step = 2
    let x0 = width / 5 + step, x1 = width - width / 5 - step
    let y0 = height / 5 + step, y1 = height - height / 5 - step
    var sum = 0.0
    var sumSq = 0.0
    var count = 0.0
    var y = y0
    while y < y1 {
      var x = x0
      while x < x1 {
        let lap = 4 * luma(x, y) - luma(x - step, y) - luma(x + step, y)
          - luma(x, y - step) - luma(x, y + step)
        let v = Double(lap)
        sum += v
        sumSq += v * v
        count += 1
        x += step
      }
      y += step
    }
    guard count > 0 else { return 0 }
    let mean = sum / count
    return sumSq / count - mean * mean
  }
}
