// Builds the app icon: a plain white macOS-style tile with the Ocean logo centred.
// Usage: swift build/make-icon.swift <logo source png> <output png>
import AppKit

let args = CommandLine.arguments
guard args.count == 3, let src = NSImage(contentsOfFile: args[1]),
      let cg = src.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
  print("usage: make-icon.swift <logo.png> <out.png>"); exit(1)
}

// Find the logo: the bounding box of dark pixels in the source.
let w = cg.width, h = cg.height
let ctx0 = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                     space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx0.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
let px = ctx0.data!.bindMemory(to: UInt8.self, capacity: w * h * 4)
var minX = w, minY = h, maxX = 0, maxY = 0
for y in 0..<h { for x in 0..<w {
  let i = (y * w + x) * 4
  if px[i + 3] > 200 && Int(px[i]) + Int(px[i + 1]) + Int(px[i + 2]) < 200 {
    minX = min(minX, x); maxX = max(maxX, x); minY = min(minY, y); maxY = max(maxY, y)
  }
}}
let logoRect = CGRect(x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1)
let logo = ctx0.makeImage()!.cropping(to: CGRect(x: logoRect.minX, y: CGFloat(h) - logoRect.maxY, width: logoRect.width, height: logoRect.height))!

// Apple's icon grid: 1024 canvas, 824 tile, continuous-ish corner radius.
let size = 1024
let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: size * 4,
                    space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
let tile = CGRect(x: 100, y: 100, width: 824, height: 824)
let path = CGPath(roundedRect: tile, cornerWidth: 185, cornerHeight: 185, transform: nil)
ctx.saveGState()
ctx.setShadow(offset: CGSize(width: 0, height: -10), blur: 28, color: NSColor(white: 0, alpha: 0.28).cgColor)
ctx.addPath(path)
ctx.setFillColor(NSColor.white.cgColor)
ctx.fillPath()
ctx.restoreGState()

// Logo at about 64% of the tile, centred.
let target: CGFloat = 824 * 0.64
let scale = target / max(logoRect.width, logoRect.height)
let lw = logoRect.width * scale, lh = logoRect.height * scale
ctx.interpolationQuality = .high
ctx.draw(logo, in: CGRect(x: tile.midX - lw / 2, y: tile.midY - lh / 2, width: lw, height: lh))

let out = NSBitmapImageRep(cgImage: ctx.makeImage()!)
try! out.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: args[2]))
print("icon written: \(args[2]) (logo \(Int(logoRect.width))x\(Int(logoRect.height)) px)")
