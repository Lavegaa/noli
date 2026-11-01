import 'package:flutter/material.dart';

import '../core/model/clicker_spec.dart';

/// Built-in sample clickers drawn in code, so the game is playable without
/// uploading a photo. Drawn into a square; no drop shadow (the stage adds it).
class BuiltinArtPainter extends CustomPainter {
  const BuiltinArtPainter(this.id);
  final String id;

  /// Colours used for "shards" particles when there is no bitmap.
  static List<Color> paletteFor(String id) => switch (id) {
        BuiltinArt.keycap => const [
            Color(0xFF4FD1C5),
            Color(0xFF1A9E92),
            Color(0xFFFFFFFF),
            Color(0xFF7BE3D8),
          ],
        _ => const [
            Color(0xFFFF3B30),
            Color(0xFFFF7A6B),
            Color(0xFFFFD0C8),
            Color(0xFF3A3F4B),
          ],
      };

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.shortestSide;
    canvas.save();
    canvas.translate((size.width - s) / 2, (size.height - s) / 2);
    switch (id) {
      case BuiltinArt.keycap:
        _keycap(canvas, s);
      default:
        _bigRedButton(canvas, s);
    }
    canvas.restore();
  }

  void _bigRedButton(Canvas canvas, double s) {
    Rect ell(double cx, double cy, double rx, double ry) =>
        Rect.fromCenter(center: Offset(cx * s, cy * s), width: rx * 2 * s, height: ry * 2 * s);

    // Housing: a short dark cylinder.
    const hx = 0.5, hTop = 0.60, hBottom = 0.74, hrx = 0.42, hry = 0.20;
    final housingSide = Path()
      ..addArc(ell(hx, hBottom, hrx, hry), 0, 3.14159)
      ..lineTo((hx - hrx) * s, hTop * s)
      ..arcTo(ell(hx, hTop, hrx, hry), 3.14159, -3.14159, false)
      ..close();
    canvas.drawPath(
      housingSide,
      Paint()
        ..shader = const LinearGradient(
          colors: [Color(0xFF1E222B), Color(0xFF3A3F4B), Color(0xFF1E222B)],
          stops: [0, 0.45, 1],
        ).createShader(ell(hx, hTop, hrx, hry)),
    );
    canvas.drawOval(
      ell(hx, hTop, hrx, hry),
      Paint()
        ..shader = const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFF5A6070), Color(0xFF2C313B)],
        ).createShader(ell(hx, hTop, hrx, hry)),
    );
    // Recess ring.
    canvas.drawOval(ell(hx, hTop - 0.005, 0.33, 0.155),
        Paint()..color = const Color(0xFF15181E));

    // Red cap: cylinder side + domed top.
    const cTop = 0.40, cBottom = 0.57, crx = 0.30, cry = 0.14;
    final capSide = Path()
      ..addArc(ell(hx, cBottom, crx, cry), 0, 3.14159)
      ..lineTo((hx - crx) * s, cTop * s)
      ..arcTo(ell(hx, cTop, crx, cry), 3.14159, -3.14159, false)
      ..close();
    canvas.drawPath(
      capSide,
      Paint()
        ..shader = const LinearGradient(
          colors: [Color(0xFFA3120C), Color(0xFFE5291F), Color(0xFF9E100A)],
          stops: [0, 0.4, 1],
        ).createShader(ell(hx, cBottom, crx, cry)),
    );
    canvas.drawOval(
      ell(hx, cTop, crx, cry),
      Paint()
        ..shader = const RadialGradient(
          center: Alignment(-0.35, -0.5),
          radius: 1.1,
          colors: [Color(0xFFFF8A7A), Color(0xFFFF3B30), Color(0xFFC81D14)],
          stops: [0, 0.45, 1],
        ).createShader(ell(hx, cTop, crx, cry)),
    );
    // Specular highlight.
    canvas.drawOval(
      ell(0.41, 0.365, 0.09, 0.035),
      Paint()
        ..color = Colors.white.withValues(alpha: 0.55)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 2),
    );
  }

  void _keycap(Canvas canvas, double s) {
    final skirt = RRect.fromLTRBR(
        0.12 * s, 0.20 * s, 0.88 * s, 0.84 * s, Radius.circular(0.11 * s));
    canvas.drawRRect(
      skirt,
      Paint()
        ..shader = const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFF2BB5A8), Color(0xFF167F76)],
        ).createShader(skirt.outerRect),
    );
    final top = RRect.fromLTRBR(
        0.21 * s, 0.22 * s, 0.79 * s, 0.68 * s, Radius.circular(0.08 * s));
    canvas.drawRRect(
      top,
      Paint()
        ..shader = const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF9DF0E7), Color(0xFF4FD1C5)],
        ).createShader(top.outerRect),
    );
    // Dish: a soft inner shade.
    canvas.drawRRect(
      top.deflate(0.03 * s),
      Paint()
        ..shader = RadialGradient(
          colors: [
            Colors.black.withValues(alpha: 0.0),
            Colors.black.withValues(alpha: 0.07),
          ],
        ).createShader(top.outerRect),
    );
    final tp = TextPainter(
      text: TextSpan(
        text: 'CLICK',
        style: TextStyle(
          fontSize: 0.105 * s,
          fontWeight: FontWeight.w900,
          letterSpacing: 0.01 * s,
          color: const Color(0xFF0E5952),
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    tp.paint(
        canvas, Offset(0.5 * s - tp.width / 2, 0.45 * s - tp.height / 2));
    tp.dispose();
  }

  @override
  bool shouldRepaint(BuiltinArtPainter oldDelegate) => oldDelegate.id != id;
}
