// Measures the face box and head turn (yaw) of every portrait for the quote page's crop and look room.
// Dev tool, run on a Mac when the images change — never at runtime:
//   swift extension/tools/measure-faces.swift extension/quotes/images > extension/tools/quote-faces.json
//   node extension/tools/quote-art.mjs           # merges it into quotes/quotes.json
// Output per file: x, y = face centre, w, h = size (normalised 0–1, top-left origin); yaw in radians,
// positive when the face turns toward the viewer's right (Vision VNDetectFaceRectanglesRequest rev. 3).
// Files where Vision finds no face are left out; tools/quote-art.json may set them by hand.
import Foundation
import Vision
import AppKit

let dir = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "extension/quotes/images"
let files = try FileManager.default.contentsOfDirectory(atPath: dir).filter { $0.lowercased().hasSuffix(".jpg") }.sorted()
let r3 = { (v: Double) in (v * 1000).rounded() / 1000 }
var out: [String: Any] = [:]
for f in files {
  let url = URL(fileURLWithPath: dir).appendingPathComponent(f)
  guard let img = NSImage(contentsOf: url), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { continue }
  let req = VNDetectFaceRectanglesRequest()
  req.revision = VNDetectFaceRectanglesRequestRevision3
  try? VNImageRequestHandler(cgImage: cg, options: [:]).perform([req])
  let faces = (req.results ?? []).sorted { $0.boundingBox.width * $0.boundingBox.height > $1.boundingBox.width * $1.boundingBox.height }
  guard let b = faces.first else { continue }
  out[f] = [
    "x": r3(Double(b.boundingBox.midX)), "y": r3(1 - Double(b.boundingBox.midY)),
    "w": r3(Double(b.boundingBox.width)), "h": r3(Double(b.boundingBox.height)),
    "yaw": r3(b.yaw?.doubleValue ?? 0),
  ]
}
let data = try JSONSerialization.data(withJSONObject: out, options: [.prettyPrinted, .sortedKeys])
print(String(data: data, encoding: .utf8)!)
