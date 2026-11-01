import 'package:clicker/core/imaging/imaging.dart';
import 'package:flutter_test/flutter_test.dart';

void setPx(RgbaImage img, int x, int y, int r, int g, int b, int a) {
  final i = (y * img.width + x) * 4;
  img.data[i] = r;
  img.data[i + 1] = g;
  img.data[i + 2] = b;
  img.data[i + 3] = a;
}

void main() {
  group('erodeAlpha', () {
    test('shrinks a 5x5 opaque square to 3x3 with radius 1', () {
      final img = RgbaImage.transparent(9, 9);
      for (var y = 2; y < 7; y++) {
        for (var x = 2; x < 7; x++) {
          setPx(img, x, y, 255, 255, 255, 255);
        }
      }
      final out = erodeAlpha(img);
      for (var y = 0; y < 9; y++) {
        for (var x = 0; x < 9; x++) {
          final inside = x >= 3 && x < 6 && y >= 3 && y < 6;
          expect(out.alphaAt(x, y), inside ? 255 : 0, reason: '($x,$y)');
        }
      }
    });

    test('does not mutate input and keeps RGB', () {
      final img = RgbaImage.transparent(5, 5);
      for (var y = 1; y < 4; y++) {
        for (var x = 1; x < 4; x++) {
          setPx(img, x, y, 10, 20, 30, 255);
        }
      }
      final out = erodeAlpha(img);
      expect(img.alphaAt(1, 1), 255);
      expect(out.data[(2 * 5 + 2) * 4], 10);
    });

    test('shape touching the image border is not eroded there', () {
      final img = RgbaImage.transparent(6, 6);
      for (var y = 0; y < 4; y++) {
        for (var x = 0; x < 4; x++) {
          setPx(img, x, y, 1, 1, 1, 255);
        }
      }
      final out = erodeAlpha(img);
      expect(out.alphaAt(0, 0), 255);
      expect(out.alphaAt(2, 0), 255);
      expect(out.alphaAt(3, 3), 0);
    });

    test('radius 0 is a copy', () {
      final img = RgbaImage.transparent(3, 3);
      setPx(img, 1, 1, 1, 2, 3, 200);
      final out = erodeAlpha(img, radius: 0);
      expect(out.alphaAt(1, 1), 200);
      expect(identical(out.data, img.data), isFalse);
    });
  });

  group('decontaminateEdges', () {
    RgbaImage rimmed() {
      // 9x9: ring0 transparent, ring1 green semi-transparent, inside white.
      final img = RgbaImage.transparent(9, 9);
      for (var y = 1; y < 8; y++) {
        for (var x = 1; x < 8; x++) {
          final rim = x == 1 || y == 1 || x == 7 || y == 7;
          if (rim) {
            setPx(img, x, y, 0, 255, 0, 128);
          } else {
            setPx(img, x, y, 255, 255, 255, 255);
          }
        }
      }
      return img;
    }

    test('rim RGB becomes ~white, alpha unchanged', () {
      final img = rimmed();
      final out = decontaminateEdges(img);
      for (var y = 1; y < 8; y++) {
        for (var x = 1; x < 8; x++) {
          final i = (y * 9 + x) * 4;
          expect(out.data[i + 3], img.data[i + 3], reason: 'alpha ($x,$y)');
          if (x == 1 || y == 1 || x == 7 || y == 7) {
            expect(out.data[i], closeTo(255, 2));
            expect(out.data[i + 1], closeTo(255, 2));
            expect(out.data[i + 2], closeTo(255, 2));
          }
        }
      }
      // transparent pixels untouched
      expect(out.data[3], 0);
    });

    test('leaves pixel unchanged when no interior neighbour exists', () {
      final img = RgbaImage.transparent(5, 5);
      setPx(img, 2, 2, 0, 255, 0, 100);
      final out = decontaminateEdges(img);
      expect(out.data.sublist(48, 52), [0, 255, 0, 100]);
    });

    test('does not mutate input', () {
      final img = rimmed();
      decontaminateEdges(img);
      expect(img.data[(1 * 9 + 1) * 4 + 1], 255);
      expect(img.data[(1 * 9 + 1) * 4], 0);
    });
  });
}
