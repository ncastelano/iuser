// scripts/local/gravar/montar-video.swift — monta o MP4 a partir dos quadros gravados (sem ffmpeg: usa o AVFoundation do próprio Mac).
// Entrada: <pasta>/linha.json  {w,h,saida:{w,h},fim,quadros:[{f,t,cx,cy,z,legenda,passo,titulo}]} e os JPEGs em <pasta>/quadros/.
// Para cada quadro: recorta a "câmera" (centro cx,cy e zoom z, em pixels do quadro), escala para a saída, desenha o passo (canto) e a legenda (embaixo).
// Uso:  swiftc -O montar-video.swift -o montar-video && ./montar-video <pasta> <saida.mp4>
import Foundation
import AVFoundation
import CoreGraphics
import CoreText
import ImageIO

struct Q { var f: String?; var t: Double; var cx: Double; var cy: Double; var z: Double; var legenda: String; var passo: String; var titulo: String; var destaque: Bool }

let args = CommandLine.arguments
guard args.count >= 3 else { print("uso: montar-video <pasta> <saida.mp4>"); exit(1) }
let pasta = args[1], saida = args[2]
let json = try! JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: pasta + "/linha.json"))) as! [String: Any]
let sw = json["w"] as! Double, sh = json["h"] as! Double
let so = json["saida"] as! [String: Any]
let W = so["w"] as! Int, H = so["h"] as! Int
let fim = json["fim"] as! Double
let quadros: [Q] = (json["quadros"] as! [[String: Any]]).map {
    Q(f: $0["f"] as? String, t: $0["t"] as! Double, cx: ($0["cx"] as? Double) ?? sw / 2, cy: ($0["cy"] as? Double) ?? sh / 2, z: ($0["z"] as? Double) ?? 1,
      legenda: ($0["legenda"] as? String) ?? "", passo: ($0["passo"] as? String) ?? "", titulo: ($0["titulo"] as? String) ?? "", destaque: ($0["destaque"] as? Bool) ?? false)
}

try? FileManager.default.removeItem(atPath: saida)
let writer = try! AVAssetWriter(outputURL: URL(fileURLWithPath: saida), fileType: .mp4)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
    AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: W, AVVideoHeightKey: H,
    AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 3_000_000, AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel],
])
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA, kCVPixelBufferWidthKey as String: W, kCVPixelBufferHeightKey as String: H,
])
writer.add(input)
writer.startWriting()
writer.startSession(atSourceTime: .zero)

let cs = CGColorSpaceCreateDeviceRGB()

func texto(_ s: String, tam: CGFloat, negrito: Bool, cor: CGColor) -> NSAttributedString {
    let fonte = CTFontCreateWithName((negrito ? "Helvetica-Bold" : "Helvetica") as CFString, tam, nil)
    return NSAttributedString(string: s, attributes: [NSAttributedString.Key(rawValue: kCTFontAttributeName as String): fonte, NSAttributedString.Key(rawValue: kCTForegroundColorAttributeName as String): cor])
}

/// desenha texto quebrado em linhas dentro de `rect` (origem embaixo-esquerda), centralizado verticalmente; devolve a altura usada
func desenharTexto(_ ctx: CGContext, _ s: NSAttributedString, em rect: CGRect) {
    let fs = CTFramesetterCreateWithAttributedString(s)
    let path = CGPath(rect: rect, transform: nil)
    let frame = CTFramesetterCreateFrame(fs, CFRange(location: 0, length: 0), path, nil)
    CTFrameDraw(frame, ctx)
}
func alturaTexto(_ s: NSAttributedString, largura: CGFloat) -> CGFloat {
    let fs = CTFramesetterCreateWithAttributedString(s)
    return CTFramesetterSuggestFrameSizeWithConstraints(fs, CFRange(location: 0, length: 0), nil, CGSize(width: largura, height: 10000), nil).height
}
func caixa(_ ctx: CGContext, _ r: CGRect, raio: CGFloat, cor: CGColor) {
    ctx.setFillColor(cor)
    ctx.addPath(CGPath(roundedRect: r, cornerWidth: raio, cornerHeight: raio, transform: nil))
    ctx.fillPath()
}

var cache: (String, CGImage)? = nil
func carregar(_ nome: String) -> CGImage? {
    if let c = cache, c.0 == nome { return c.1 }
    guard let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: pasta + "/quadros/" + nome) as CFURL, nil), let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else { return nil }
    cache = (nome, img)
    return img
}

let escalaUI = CGFloat(W) / 720.0

for q in quadros {
    var pb: CVPixelBuffer?
    CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pb)
    guard let buf = pb else { continue }
    CVPixelBufferLockBaseAddress(buf, [])
    let ctx = CGContext(data: CVPixelBufferGetBaseAddress(buf), width: W, height: H, bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(buf), space: cs,
                        bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)!
    ctx.interpolationQuality = .high
    ctx.setFillColor(CGColor(red: 0.07, green: 0.07, blue: 0.09, alpha: 1))
    ctx.fill(CGRect(x: 0, y: 0, width: W, height: H))

    if let nome = q.f, let img = carregar(nome) {
        // câmera: recorte de (cx,cy) com largura sw/z, mantendo a proporção do quadro
        let cw = sw / q.z, ch = sh / q.z
        let x = min(max(q.cx - cw / 2, 0), sw - cw), y = min(max(q.cy - ch / 2, 0), sh - ch)
        let fator = CGFloat(img.width) / CGFloat(sw)
        if let rec = img.cropping(to: CGRect(x: x * fator, y: y * fator, width: cw * fator, height: ch * fator)) {
            ctx.draw(rec, in: CGRect(x: 0, y: 0, width: W, height: H))
        }
    } else if !q.titulo.isEmpty {
        // cartão de título
        let marg = 60 * escalaUI
        let t = texto(q.titulo, tam: 46 * escalaUI, negrito: true, cor: CGColor(red: 1, green: 1, blue: 1, alpha: 1))
        let hT = alturaTexto(t, largura: CGFloat(W) - 2 * marg)
        desenharTexto(ctx, t, em: CGRect(x: marg, y: (CGFloat(H) - hT) / 2, width: CGFloat(W) - 2 * marg, height: hT + 10))
        let sub = texto(q.legenda, tam: 28 * escalaUI, negrito: false, cor: CGColor(red: 1, green: 1, blue: 1, alpha: 0.75))
        let hS = alturaTexto(sub, largura: CGFloat(W) - 2 * marg)
        desenharTexto(ctx, sub, em: CGRect(x: marg, y: (CGFloat(H) - hT) / 2 - hS - 30 * escalaUI, width: CGFloat(W) - 2 * marg, height: hS + 10))
    }

    // passo (canto de cima à esquerda)
    if !q.passo.isEmpty && q.titulo.isEmpty {
        let t = texto(q.passo, tam: 22 * escalaUI, negrito: true, cor: CGColor(red: 1, green: 1, blue: 1, alpha: 1))
        let w = CTLineGetTypographicBounds(CTLineCreateWithAttributedString(t), nil, nil, nil) + 30 * Double(escalaUI)
        caixa(ctx, CGRect(x: 22 * escalaUI, y: CGFloat(H) - 74 * escalaUI, width: CGFloat(w), height: 44 * escalaUI), raio: 22 * escalaUI, cor: CGColor(red: 0.98, green: 0.45, blue: 0.09, alpha: 0.95))
        desenharTexto(ctx, t, em: CGRect(x: 22 * escalaUI + 15 * escalaUI, y: CGFloat(H) - 74 * escalaUI + 9 * escalaUI, width: CGFloat(w), height: 30 * escalaUI))
    }
    // legenda (embaixo)
    if !q.legenda.isEmpty && q.titulo.isEmpty {
        let marg = 26 * escalaUI
        let t = texto(q.legenda, tam: 27 * escalaUI, negrito: q.destaque, cor: CGColor(red: 1, green: 1, blue: 1, alpha: 1))
        let hT = alturaTexto(t, largura: CGFloat(W) - 2 * marg - 36 * escalaUI)
        let altCaixa = hT + 34 * escalaUI
        let y0 = 150 * escalaUI   // acima da faixa "ambiente de teste" e da barra do app
        caixa(ctx, CGRect(x: marg, y: y0, width: CGFloat(W) - 2 * marg, height: altCaixa), raio: 26 * escalaUI, cor: CGColor(red: 0.06, green: 0.06, blue: 0.08, alpha: 0.86))
        desenharTexto(ctx, t, em: CGRect(x: marg + 18 * escalaUI, y: y0 + 16 * escalaUI, width: CGFloat(W) - 2 * marg - 36 * escalaUI, height: hT + 8))
    }
    CVPixelBufferUnlockBaseAddress(buf, [])

    while !input.isReadyForMoreMediaData { Thread.sleep(forTimeInterval: 0.005) }
    adaptor.append(buf, withPresentationTime: CMTime(seconds: q.t, preferredTimescale: 600))
}
input.markAsFinished()
writer.endSession(atSourceTime: CMTime(seconds: fim, preferredTimescale: 600))
let sem = DispatchSemaphore(value: 0)
writer.finishWriting { sem.signal() }
sem.wait()
print(writer.status == .completed ? "ok \(saida)" : "falhou: \(String(describing: writer.error))")
