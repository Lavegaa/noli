import 'dart:typed_data';

import 'package:clicker/core/imaging/imaging.dart';
import 'package:flutter_test/flutter_test.dart';

/// Builds an image where pixels inside any of [rects] are opaque red.
RgbaImage blobs(int w, int h, List<(int, int, int, int)> rects) {
  final data = Uint8List(w * h * 4);
  for (final (l, t, rw, rh) in rects) {
    for (var y = t; y < t + rh; y++) {
      for (var x = l; x < l + rw; x++) {
        final i = (y * w + x) * 4;
        data[i] = 255;
        data[i + 3] = 255;
      }
    }
  }
  return RgbaImage(w, h, data);
}

void main() {
  group('RgbaImage', () {
    test('validates buffer length', () {
      expect(() => RgbaImage(2, 2, Uint8List(15)), throwsArgumentError);
    });
  });

  group('connectedAlphaRegion', () {
    final img = blobs(20, 10, [(1, 1, 5, 5), (10, 2, 6, 6)]);

    test('keeps only the tapped blob', () {
      final out = connectedAlphaRegion(img, 12, 4)!;
      expect(out.alphaAt(12, 4), 255);
      expect(out.alphaAt(15, 7), 255);
      expect(out.alphaAt(3, 3), 0); // other blob removed
      expect(out.data[(3 * 20 + 3) * 4], 0); // and its colour cleared
      // Source untouched.
      expect(img.alphaAt(3, 3), 255);
    });

    test('tapping a transparent pixel returns null', () {
      expect(connectedAlphaRegion(img, 8, 8), isNull);
    });

    test('out of bounds returns null', () {
      expect(connectedAlphaRegion(img, -1, 0), isNull);
      expect(connectedAlphaRegion(img, 20, 0), isNull);
    });

    test('diagonal-only neighbours are not connected', () {
      final d = blobs(4, 4, [(0, 0, 1, 1), (1, 1, 1, 1)]);
      final out = connectedAlphaRegion(d, 0, 0)!;
      expect(out.alphaAt(0, 0), 255);
      expect(out.alphaAt(1, 1), 0);
    });

    test('keeps soft fringe pixels touching the region', () {
      final d = blobs(6, 3, [(0, 0, 3, 3)]);
      d.data[(1 * 6 + 3) * 4 + 3] = 10; // faint edge pixel next to blob
      d.data[(1 * 6 + 5) * 4 + 3] = 10; // faint isolated pixel
      final out = connectedAlphaRegion(d, 1, 1)!;
      expect(out.alphaAt(3, 1), 10);
      expect(out.alphaAt(5, 1), 0);
    });
  });

  group('featherAlpha', () {
    test('softens the edge but keeps the interior at 255', () {
      final img = blobs(30, 30, [(5, 5, 20, 20)]);
      final out = featherAlpha(img);
      expect(out.alphaAt(15, 15), 255);
      expect(out.alphaAt(9, 15), 255);
      expect(out.alphaAt(5, 15), inExclusiveRange(0, 255));
      // Never grows outward onto transparent (possibly black) pixels.
      expect(out.alphaAt(4, 15), 0);
      expect(out.width, 30);
    });
  });

  group('cropToContent', () {
    test('crops to a centred square with 8% padding', () {
      final img = blobs(100, 80, [(20, 10, 50, 25)]);
      final b = contentBounds(img)!;
      expect((b.left, b.top, b.width, b.height), (20, 10, 50, 25));

      final out = cropToContent(img)!;
      // side = 50 + 2 * round(50 * 0.08) = 58
      expect(out.width, 58);
      expect(out.height, 58);
      final ob = contentBounds(out)!;
      expect(ob.width, 50);
      expect(ob.height, 25);
      expect(ob.left, 4);
      // Vertically centred: (58 - 25) / 2 = 16.5 -> 16
      expect(ob.top, anyOf(16, 17));
    });

    test('fully transparent image returns null', () {
      expect(cropToContent(blobs(10, 10, const [])), isNull);
      expect(contentBounds(blobs(10, 10, const [])), isNull);
    });
  });

  group('fitTo', () {
    test('scales the long side down, never up', () {
      expect(fitTo(4000, 3000, 1024), (1024, 768));
      expect(fitTo(3000, 4000, 1024), (768, 1024));
      expect(fitTo(500, 300, 1024), (500, 300));
      expect(fitTo(10000, 1, 1024), (1024, 1));
    });
  });
}
