/// RGBA mask operations used by the cut-out pipeline. Pure Dart.
library;

import 'dart:math' as math;
import 'dart:typed_data';

/// Straight (non-premultiplied) RGBA8888, row-major.
class RgbaImage {
  RgbaImage(this.width, this.height, this.data) {
    if (width <= 0 || height <= 0 || data.length != width * height * 4) {
      throw ArgumentError(
          'RgbaImage ${width}x$height needs ${width * height * 4} bytes, '
          'got ${data.length}');
    }
  }

  factory RgbaImage.transparent(int width, int height) =>
      RgbaImage(width, height, Uint8List(width * height * 4));

  final int width;
  final int height;
  final Uint8List data;

  int alphaAt(int x, int y) => data[(y * width + x) * 4 + 3];

  bool contains(int x, int y) => x >= 0 && y >= 0 && x < width && y < height;

  RgbaImage copy() => RgbaImage(width, height, Uint8List.fromList(data));
}

class PixelRect {
  const PixelRect(this.left, this.top, this.width, this.height);
  final int left, top, width, height;

  @override
  String toString() => 'PixelRect($left, $top, ${width}x$height)';
}

/// Keeps only the region 4-connected to (x, y) whose alpha >= [threshold],
/// plus faint fringe pixels directly touching it (so soft edges survive).
/// Everything else becomes fully transparent (RGBA 0).
/// Returns null if (x, y) is out of bounds or not part of any region.
RgbaImage? connectedAlphaRegion(
  RgbaImage img,
  int x,
  int y, {
  int threshold = 32,
}) {
  if (!img.contains(x, y) || img.alphaAt(x, y) < threshold) return null;
  final w = img.width, h = img.height;
  final src = img.data;
  final keep = Uint8List(w * h); // 0 = no, 1 = region, 2 = fringe
  final queue = Int32List(w * h);
  var head = 0, tail = 0;
  final start = y * w + x;
  keep[start] = 1;
  queue[tail++] = start;

  while (head < tail) {
    final p = queue[head++];
    final px = p % w;
    final py = p ~/ w;
    void visit(int n) {
      if (keep[n] != 0) return;
      final a = src[n * 4 + 3];
      if (a >= threshold) {
        keep[n] = 1;
        queue[tail++] = n;
      } else if (a > 0) {
        keep[n] = 2;
      }
    }

    if (px > 0) visit(p - 1);
    if (px < w - 1) visit(p + 1);
    if (py > 0) visit(p - w);
    if (py < h - 1) visit(p + w);
  }

  final out = Uint8List(src.length);
  for (var i = 0; i < keep.length; i++) {
    if (keep[i] != 0) {
      final o = i * 4;
      out[o] = src[o];
      out[o + 1] = src[o + 1];
      out[o + 2] = src[o + 2];
      out[o + 3] = src[o + 3];
    }
  }
  return RgbaImage(w, h, out);
}

/// Softens the alpha edge with a separable box blur of [radius] pixels
/// (fractional radii weight the outermost taps). The result is
/// `min(original, blurred)`: edges are softened inward only, so transparent
/// (often black) pixels never bleed in as a dark halo, and solid interiors
/// stay at exactly 255. Only alpha changes.
RgbaImage featherAlpha(RgbaImage img, {double radius = 1.5}) {
  final w = img.width, h = img.height;
  final r = radius.ceil();
  if (r <= 0) return img.copy();
  final edge = radius - (r - 1); // weight of the outermost tap (0..1]
  final weights = List<double>.generate(
      2 * r + 1, (i) => (i == 0 || i == 2 * r) ? edge : 1.0);
  final total = weights.fold<double>(0, (a, b) => a + b);

  final alpha = Float32List(w * h);
  for (var i = 0; i < w * h; i++) {
    alpha[i] = img.data[i * 4 + 3].toDouble();
  }

  Float32List pass(Float32List input, bool horizontal) {
    final out = Float32List(w * h);
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        final c = input[y * w + x];
        var uniform = true;
        var sum = 0.0;
        for (var k = -r; k <= r; k++) {
          final sx = horizontal ? (x + k).clamp(0, w - 1) : x;
          final sy = horizontal ? y : (y + k).clamp(0, h - 1);
          final v = input[sy * w + sx];
          if (v != c) uniform = false;
          sum += v * weights[k + r];
        }
        out[y * w + x] = uniform ? c : sum / total;
      }
    }
    return out;
  }

  final blurred = pass(pass(alpha, true), false);
  final out = Uint8List.fromList(img.data);
  for (var i = 0; i < w * h; i++) {
    final a = out[i * 4 + 3];
    final b = blurred[i].round().clamp(0, 255);
    if (b < a) out[i * 4 + 3] = b;
  }
  return RgbaImage(w, h, out);
}

/// Separable max filter (window radius [r], out-of-bounds ignored) over a
/// byte plane. Used for dilation of 0/1 masks and for alpha erosion.
Uint8List _filterPlane(Uint8List src, int w, int h, int r, bool takeMax) {
  Uint8List pass(Uint8List input, bool horizontal) {
    final out = Uint8List(w * h);
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        final c = input[y * w + x];
        var best = c;
        if (horizontal) {
          final lo = x - r < 0 ? 0 : x - r;
          final hi = x + r >= w ? w - 1 : x + r;
          final row = y * w;
          for (var k = lo; k <= hi; k++) {
            final v = input[row + k];
            if (takeMax ? v > best : v < best) best = v;
          }
        } else {
          final lo = y - r < 0 ? 0 : y - r;
          final hi = y + r >= h ? h - 1 : y + r;
          for (var k = lo; k <= hi; k++) {
            final v = input[k * w + x];
            if (takeMax ? v > best : v < best) best = v;
          }
        }
        out[y * w + x] = best;
      }
    }
    return out;
  }

  return pass(pass(src, true), false);
}

/// Alpha min-filter: the silhouette shrinks by [radius] pixels. Fully
/// transparent pixels stay 0, interior pixels stay 255. Only alpha changes;
/// pixels outside the image are ignored (a shape touching the border is not
/// eroded there).
RgbaImage erodeAlpha(RgbaImage img, {int radius = 1}) {
  if (radius <= 0) return img.copy();
  final w = img.width, h = img.height;
  final alpha = Uint8List(w * h);
  for (var i = 0; i < alpha.length; i++) {
    alpha[i] = img.data[i * 4 + 3];
  }
  final eroded = _filterPlane(alpha, w, h, radius, false);
  final out = Uint8List.fromList(img.data);
  for (var i = 0; i < eroded.length; i++) {
    out[i * 4 + 3] = eroded[i];
  }
  return RgbaImage(w, h, out);
}

/// Colour decontamination: removes background colour bleed on the edge.
/// Every pixel with 0 < alpha < [alphaFullThreshold], plus opaque pixels
/// within 2px of a non-full pixel, gets the average RGB of nearby interior
/// pixels (fully opaque, at least 3px from the edge; falls back to 2px) found
/// within [searchRadius]. Alpha is kept; pixels with no interior neighbour
/// are left as is. Only the edge band is visited.
RgbaImage decontaminateEdges(
  RgbaImage img, {
  int alphaFullThreshold = 250,
  int searchRadius = 3,
}) {
  final w = img.width, h = img.height;
  final src = img.data;
  final nonFull = Uint8List(w * h);
  for (var i = 0; i < nonFull.length; i++) {
    if (src[i * 4 + 3] < alphaFullThreshold) nonFull[i] = 1;
  }
  final near1 = _filterPlane(nonFull, w, h, 1, true);
  final near2 = _filterPlane(nonFull, w, h, 2, true);

  final out = Uint8List.fromList(src);
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      final p = y * w + x;
      final a = src[p * 4 + 3];
      if (a == 0) continue;
      if (!(a < alphaFullThreshold || near2[p] == 1)) continue;

      final y0 = y - searchRadius < 0 ? 0 : y - searchRadius;
      final y1 = y + searchRadius >= h ? h - 1 : y + searchRadius;
      final x0 = x - searchRadius < 0 ? 0 : x - searchRadius;
      final x1 = x + searchRadius >= w ? w - 1 : x + searchRadius;
      var rA = 0, gA = 0, bA = 0, nA = 0; // tier A: >= 3px inside
      var rB = 0, gB = 0, bB = 0, nB = 0; // tier B: >= 2px inside
      for (var yy = y0; yy <= y1; yy++) {
        for (var xx = x0; xx <= x1; xx++) {
          final q = yy * w + xx;
          if (near1[q] == 1) continue; // edge pixel or adjacent to one
          final o = q * 4;
          if (near2[q] == 0) {
            rA += src[o];
            gA += src[o + 1];
            bA += src[o + 2];
            nA++;
          } else {
            rB += src[o];
            gB += src[o + 1];
            bB += src[o + 2];
            nB++;
          }
        }
      }
      final o = p * 4;
      if (nA > 0) {
        out[o] = (rA / nA).round();
        out[o + 1] = (gA / nA).round();
        out[o + 2] = (bA / nA).round();
      } else if (nB > 0) {
        out[o] = (rB / nB).round();
        out[o + 1] = (gB / nB).round();
        out[o + 2] = (bB / nB).round();
      }
    }
  }
  return RgbaImage(w, h, out);
}

/// Bounding box of pixels with alpha > [alphaThreshold], or null if none.
PixelRect? contentBounds(RgbaImage img, {int alphaThreshold = 8}) {
  final w = img.width, h = img.height;
  var minX = w, minY = h, maxX = -1, maxY = -1;
  for (var y = 0; y < h; y++) {
    final row = y * w;
    for (var x = 0; x < w; x++) {
      if (img.data[(row + x) * 4 + 3] > alphaThreshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return PixelRect(minX, minY, maxX - minX + 1, maxY - minY + 1);
}

/// Crops to the content and centres it on a transparent square canvas with
/// [paddingRatio] of the long side as margin on every edge, so every clicker
/// renders centred and at a consistent size. Null if fully transparent.
RgbaImage? cropToContent(
  RgbaImage img, {
  double paddingRatio = 0.08,
  int alphaThreshold = 8,
}) {
  final b = contentBounds(img, alphaThreshold: alphaThreshold);
  if (b == null) return null;
  final longSide = math.max(b.width, b.height);
  final pad = (longSide * paddingRatio).round();
  final side = longSide + 2 * pad;
  final offX = (side - b.width) ~/ 2;
  final offY = (side - b.height) ~/ 2;
  final out = Uint8List(side * side * 4);
  for (var y = 0; y < b.height; y++) {
    final srcStart = ((b.top + y) * img.width + b.left) * 4;
    final dstStart = ((offY + y) * side + offX) * 4;
    out.setRange(dstStart, dstStart + b.width * 4, img.data, srcStart);
  }
  return RgbaImage(side, side, out);
}

/// Size that fits within [maxSide] on the long side, keeping aspect ratio.
/// Never upscales; each side is at least 1.
(int, int) fitTo(int width, int height, int maxSide) {
  final long = math.max(width, height);
  if (long <= maxSide) return (width, height);
  final s = maxSide / long;
  return (
    math.max(1, (width * s).round()),
    math.max(1, (height * s).round()),
  );
}
