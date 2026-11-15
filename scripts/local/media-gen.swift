// Gerador de MÍDIA DE TESTE (só local): vídeos MP4 (H.264) e PDFs a partir de uma lista em JSON — usado por seed-digital-pizzaria.mjs para ter vídeo-aula de verdade tocando.
// Os vídeos são cartões animados (título, número da aula, barra de progresso): servem para ver a plataforma funcionando, não são aulas reais.
//   swiftc -O -swift-version 5 scripts/local/media-gen.swift -o /tmp/iuser-media-gen && /tmp/iuser-media-gen jobs.json
import Foundation
import AVFoundation
import CoreGraphics
import CoreText
import CoreVideo

struct Page: Decodable { let heading: String; let lines: [String] }
struct Job: Decodable {
    let kind: String            // "video" | "pdf"
    let out: String
    let title: String
    let subtitle: String?
    let badge: String?
    let c1: String
    let c2: String
    let emoji: String?
    let seconds: Double?
    let pages: [Page]?
}

func rgb(_ hex: String, _ alpha: CGFloat = 1) -> CGColor {
    var h = hex
    if h.hasPrefix("#") { h.removeFirst() }
    let v = UInt32(h, radix: 16) ?? 0
    return CGColor(red: CGFloat((v >> 16) & 255) / 255, green: CGFloat((v >> 8) & 255) / 255, blue: CGFloat(v & 255) / 255, alpha: alpha)
}

func drawText(_ ctx: CGContext, _ text: String, font: String, size: CGFloat, color: CGColor, rect: CGRect, align: CTTextAlignment = .left, lineSpacing: CGFloat = 4) {
    let ctFont = CTFontCreateWithName(font as CFString, size, nil)
    var al = align
    var ls = lineSpacing
    let style: CTParagraphStyle = withUnsafePointer(to: &al) { pa in
        withUnsafePointer(to: &ls) { pl in
            let settings = [
                CTParagraphStyleSetting(spec: .alignment, valueSize: MemoryLayout<CTTextAlignment>.size, value: pa),
                CTParagraphStyleSetting(spec: .lineSpacingAdjustment, valueSize: MemoryLayout<CGFloat>.size, value: pl),
            ]
            return CTParagraphStyleCreate(settings, settings.count)
        }
    }
    let attrs: [NSAttributedString.Key: Any] = [
        NSAttributedString.Key(kCTFontAttributeName as String): ctFont,
        NSAttributedString.Key(kCTForegroundColorAttributeName as String): color,
        NSAttributedString.Key(kCTParagraphStyleAttributeName as String): style,
    ]
    let fs = CTFramesetterCreateWithAttributedString(NSAttributedString(string: text, attributes: attrs))
    let frame = CTFramesetterCreateFrame(fs, CFRangeMake(0, 0), CGPath(rect: rect, transform: nil), nil)
    CTFrameDraw(frame, ctx)
}

func roundedRect(_ ctx: CGContext, _ r: CGRect, _ radius: CGFloat, _ color: CGColor) {
    ctx.setFillColor(color)
    ctx.addPath(CGPath(roundedRect: r, cornerWidth: radius, cornerHeight: radius, transform: nil))
    ctx.fillPath()
}

// ---------------------------------------------------------------- vídeo
let W = 960, H = 540, FPS = 15

func drawFrame(_ ctx: CGContext, _ job: Job, t: Double, total: Double) {
    let w = CGFloat(W), h = CGFloat(H)
    let grad = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: [rgb(job.c1), rgb(job.c2)] as CFArray, locations: [0, 1])!
    ctx.drawLinearGradient(grad, start: CGPoint(x: 0, y: h), end: CGPoint(x: w, y: 0), options: [])
    // círculos que passeiam devagar
    for i in 0..<4 {
        let f = Double(i) * 1.7
        let cx = w * (0.15 + 0.7 * CGFloat((sin(t * 0.35 + f) + 1) / 2))
        let cy = h * (0.2 + 0.6 * CGFloat((cos(t * 0.27 + f * 1.3) + 1) / 2))
        ctx.setFillColor(rgb("#ffffff", 0.07))
        ctx.fillEllipse(in: CGRect(x: cx - 120 - CGFloat(i) * 30, y: cy - 120 - CGFloat(i) * 30, width: 240 + CGFloat(i) * 60, height: 240 + CGFloat(i) * 60))
    }
    // emoji flutuando
    let bob = CGFloat(sin(t * 1.6)) * 10
    drawText(ctx, job.emoji ?? "🍕", font: "Apple Color Emoji", size: 190, color: rgb("#ffffff"), rect: CGRect(x: w - 330, y: h / 2 - 120 + bob, width: 260, height: 240), align: .center)
    // selo da aula
    if let badge = job.badge {
        roundedRect(ctx, CGRect(x: 56, y: h - 96, width: CGFloat(badge.count) * 15 + 40, height: 40), 20, rgb("#000000", 0.28))
        drawText(ctx, badge, font: "HelveticaNeue-Bold", size: 20, color: rgb("#ffffff"), rect: CGRect(x: 76, y: h - 90, width: 500, height: 30))
    }
    // título com entrada suave
    let a = CGFloat(min(1, max(0, t / 0.9)))
    let slide = (1 - a) * 28
    drawText(ctx, job.title, font: "HelveticaNeue-Bold", size: 56, color: rgb("#ffffff", a), rect: CGRect(x: 56, y: h / 2 - 90 - slide, width: w - 400, height: 220), lineSpacing: 6)
    if let sub = job.subtitle {
        let a2 = CGFloat(min(1, max(0, (t - 0.5) / 0.9)))
        drawText(ctx, sub, font: "HelveticaNeue", size: 26, color: rgb("#ffffff", 0.9 * a2), rect: CGRect(x: 56, y: h / 2 - 150 - slide, width: w - 400, height: 60))
    }
    // rodapé + barra de progresso
    drawText(ctx, "Pizzaria Forno de Ouro · Curso online", font: "HelveticaNeue-Medium", size: 20, color: rgb("#ffffff", 0.85), rect: CGRect(x: 56, y: 44, width: 560, height: 28))
    roundedRect(ctx, CGRect(x: 56, y: 26, width: w - 112, height: 6), 3, rgb("#ffffff", 0.25))
    roundedRect(ctx, CGRect(x: 56, y: 26, width: max(6, (w - 112) * CGFloat(t / total)), height: 6), 3, rgb("#ffffff", 0.95))
}

func makeVideo(_ job: Job) throws {
    let seconds = job.seconds ?? 10
    let totalFrames = Int(seconds * Double(FPS))
    let url = URL(fileURLWithPath: job.out)
    try? FileManager.default.removeItem(at: url)
    let writer = try AVAssetWriter(outputURL: url, fileType: .mp4)
    let settings: [String: Any] = [
        AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: W, AVVideoHeightKey: H,
        AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 900_000, AVVideoProfileLevelKey: AVVideoProfileLevelH264MainAutoLevel, AVVideoMaxKeyFrameIntervalKey: FPS * 2],
    ]
    let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
    input.expectsMediaDataInRealTime = false
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA, kCVPixelBufferWidthKey as String: W, kCVPixelBufferHeightKey as String: H,
    ])
    writer.add(input)
    guard writer.startWriting() else { throw writer.error ?? NSError(domain: "media-gen", code: 1) }
    writer.startSession(atSourceTime: .zero)
    for i in 0..<totalFrames {
        while !input.isReadyForMoreMediaData { Thread.sleep(forTimeInterval: 0.002) }
        var pb: CVPixelBuffer?
        CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pb)
        guard let buf = pb else { continue }
        CVPixelBufferLockBaseAddress(buf, [])
        if let ctx = CGContext(data: CVPixelBufferGetBaseAddress(buf), width: W, height: H, bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(buf),
                               space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue) {
            drawFrame(ctx, job, t: Double(i) / Double(FPS), total: seconds)
        }
        CVPixelBufferUnlockBaseAddress(buf, [])
        adaptor.append(buf, withPresentationTime: CMTime(value: Int64(i), timescale: Int32(FPS)))
    }
    input.markAsFinished()
    let sem = DispatchSemaphore(value: 0)
    writer.finishWriting { sem.signal() }
    sem.wait()
    if writer.status != .completed { throw writer.error ?? NSError(domain: "media-gen", code: 2) }
}

// ---------------------------------------------------------------- pdf
func makePDF(_ job: Job) {
    var box = CGRect(x: 0, y: 0, width: 595, height: 842)
    guard let ctx = CGContext(URL(fileURLWithPath: job.out) as CFURL, mediaBox: &box, nil) else { return }
    let pages = job.pages ?? [Page(heading: job.title, lines: [job.subtitle ?? ""])]
    for (n, p) in pages.enumerated() {
        ctx.beginPDFPage(nil)
        ctx.setFillColor(rgb(job.c1)); ctx.fill(CGRect(x: 0, y: 742, width: 595, height: 100))
        drawText(ctx, job.title, font: "HelveticaNeue-Bold", size: 15, color: rgb("#ffffff", 0.9), rect: CGRect(x: 48, y: 790, width: 500, height: 24))
        drawText(ctx, p.heading, font: "HelveticaNeue-Bold", size: 30, color: rgb("#ffffff"), rect: CGRect(x: 48, y: 748, width: 500, height: 44))
        drawText(ctx, p.lines.joined(separator: "\n\n"), font: "HelveticaNeue", size: 14, color: rgb("#1f2937"), rect: CGRect(x: 48, y: 90, width: 499, height: 620), lineSpacing: 5)
        drawText(ctx, "Pizzaria Forno de Ouro · \(n + 1)/\(pages.count)", font: "HelveticaNeue", size: 10, color: rgb("#6b7280"), rect: CGRect(x: 48, y: 40, width: 500, height: 16))
        ctx.endPDFPage()
    }
    ctx.closePDF()
}

// ---------------------------------------------------------------- main
guard CommandLine.arguments.count > 1, let data = FileManager.default.contents(atPath: CommandLine.arguments[1]),
      let jobs = try? JSONDecoder().decode([Job].self, from: data) else {
    FileHandle.standardError.write(Data("uso: iuser-media-gen jobs.json\n".utf8)); exit(2)
}
for (i, job) in jobs.enumerated() {
    do {
        if job.kind == "pdf" { makePDF(job) } else { try makeVideo(job) }
        print("[\(i + 1)/\(jobs.count)] \(job.out)")
    } catch {
        FileHandle.standardError.write(Data("erro em \(job.out): \(error)\n".utf8)); exit(1)
    }
}
