import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../core/model/settings.dart';

enum ParticleKind { spark, star, shard, ring }

class Particle {
  bool alive = false;
  ParticleKind kind = ParticleKind.spark;
  double x = 0, y = 0, vx = 0, vy = 0;
  double age = 0, life = 0.45;
  double size = 0, rot = 0, spin = 0, gravity = 0;
  Color color = Colors.white;
  Rect? src; // shard: source rect within the clicker image
}

/// Fixed-size particle pool. No allocation per tap; the oldest particle is
/// recycled when the pool is full. Updated by the stage's single ticker.
class ParticleSystem {
  ParticleSystem({int capacity = 160, math.Random? random})
      : _pool = List.generate(capacity, (_) => Particle()),
        _rng = random ?? math.Random();

  static const baseLife = 0.45; // seconds

  final List<Particle> _pool;
  final math.Random _rng;
  int _cursor = 0;
  int _alive = 0;

  bool get isEmpty => _alive == 0;
  Iterable<Particle> get alive => _pool.where((p) => p.alive);

  Particle _next() {
    // Prefer a free slot; otherwise recycle round-robin (oldest-ish).
    for (var i = 0; i < _pool.length; i++) {
      final p = _pool[(_cursor + i) % _pool.length];
      if (!p.alive) {
        _cursor = (_cursor + i + 1) % _pool.length;
        _alive++;
        return p..alive = true;
      }
    }
    final p = _pool[_cursor];
    _cursor = (_cursor + 1) % _pool.length;
    return p..alive = true;
  }

  double _r(double a, double b) => a + _rng.nextDouble() * (b - a);

  /// Emits a burst at [at]. [scale] is relative to a 300px stage.
  void burst({
    required ParticleTheme theme,
    required Offset at,
    required int count,
    required double scale,
    required Color accent,
    List<Color> palette = const [],
    Size? imageSize,
  }) {
    if (count <= 0) return;
    // Shockwave ring.
    final ring = _next()
      ..kind = ParticleKind.ring
      ..x = at.dx
      ..y = at.dy
      ..vx = 0
      ..vy = 0
      ..age = 0
      ..life = 0.32
      ..size = 70 * scale * (0.8 + count / 30)
      ..color = accent;
    ring.gravity = 0;

    for (var i = 0; i < count; i++) {
      final p = _next()
        ..age = 0
        ..x = at.dx
        ..y = at.dy
        ..rot = _r(0, math.pi * 2)
        ..life = baseLife * _r(0.75, 1.2);
      final angle = _r(0, math.pi * 2);
      switch (theme) {
        case ParticleTheme.sparks || ParticleTheme.none:
          final speed = _r(320, 680) * scale;
          p
            ..kind = ParticleKind.spark
            ..vx = math.cos(angle) * speed
            ..vy = math.sin(angle) * speed - 120 * scale
            ..gravity = 900 * scale
            ..size = _r(10, 22) * scale
            ..spin = 0
            ..color = _pick(const [
              Color(0xFFFFFFFF),
              Color(0xFFFFE45C),
              Color(0xFFFFB627),
              Color(0xFFFF6B35),
            ]);
        case ParticleTheme.stars:
          final speed = _r(200, 460) * scale;
          p
            ..kind = ParticleKind.star
            ..vx = math.cos(angle) * speed
            ..vy = math.sin(angle) * speed - 160 * scale
            ..gravity = 700 * scale
            ..size = _r(6, 13) * scale
            ..spin = _r(-9, 9)
            ..color = _pick(const [
              Color(0xFFFFD23F),
              Color(0xFFFF6FB5),
              Color(0xFF3DDBD9),
              Color(0xFF9B5DE5),
              Color(0xFFFFFFFF),
            ]);
        case ParticleTheme.shards:
          final speed = _r(220, 520) * scale;
          final s = _r(9, 17) * scale;
          p
            ..kind = ParticleKind.shard
            ..vx = math.cos(angle) * speed
            ..vy = math.sin(angle) * speed - 200 * scale
            ..gravity = 1500 * scale
            ..size = s
            ..spin = _r(-14, 14)
            ..color = palette.isEmpty ? accent : _pick(palette);
          if (imageSize != null && imageSize.shortestSide > 8) {
            final srcSide = imageSize.shortestSide * _r(0.06, 0.12);
            // Bias towards the centre where the subject is opaque.
            final cx = imageSize.width * _r(0.3, 0.7);
            final cy = imageSize.height * _r(0.3, 0.7);
            p.src = Rect.fromCenter(
                center: Offset(cx, cy), width: srcSide, height: srcSide);
          } else {
            p.src = null;
          }
      }
    }
  }

  Color _pick(List<Color> c) => c[_rng.nextInt(c.length)];

  /// Advances the simulation by [dt] seconds.
  void update(double dt) {
    if (_alive == 0) return;
    final drag = math.pow(0.08, dt).toDouble();
    var alive = 0;
    for (final p in _pool) {
      if (!p.alive) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.alive = false;
        continue;
      }
      alive++;
      p.vx *= drag;
      p.vy = p.vy * drag + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
    }
    _alive = alive;
  }

  void clear() {
    for (final p in _pool) {
      p.alive = false;
    }
    _alive = 0;
  }
}

/// Paints a [ParticleSystem]; repaints via [repaint] without widget rebuilds.
class ParticlePainter extends CustomPainter {
  ParticlePainter({
    required this.system,
    required Listenable repaint,
    this.image,
  }) : super(repaint: repaint);

  final ParticleSystem system;
  final ui.Image? image;

  static final Path _star = () {
    final path = Path();
    for (var i = 0; i < 10; i++) {
      final r = i.isEven ? 1.0 : 0.45;
      final a = -math.pi / 2 + i * math.pi / 5;
      final pt = Offset(math.cos(a) * r, math.sin(a) * r);
      i == 0 ? path.moveTo(pt.dx, pt.dy) : path.lineTo(pt.dx, pt.dy);
    }
    return path..close();
  }();

  static final Path _shard = Path()
    ..moveTo(0, -1)
    ..lineTo(0.9, 0.6)
    ..lineTo(-0.7, 0.8)
    ..close();

  final Paint _paint = Paint()..isAntiAlias = true;

  @override
  void paint(Canvas canvas, Size size) {
    for (final p in system.alive) {
      final t = (p.age / p.life).clamp(0.0, 1.0);
      final fade = 1 - t;
      switch (p.kind) {
        case ParticleKind.ring:
          final e = 1 - math.pow(1 - t, 3).toDouble();
          _paint
            ..style = PaintingStyle.stroke
            ..strokeWidth = 7 * fade + 0.5
            ..color = p.color.withValues(alpha: 0.55 * fade);
          canvas.drawCircle(Offset(p.x, p.y), p.size * e, _paint);
        case ParticleKind.spark:
          final speed = math.sqrt(p.vx * p.vx + p.vy * p.vy);
          if (speed < 1) continue;
          final len = p.size * (0.4 + 0.6 * fade);
          final dx = p.vx / speed * len, dy = p.vy / speed * len;
          _paint
            ..style = PaintingStyle.stroke
            ..strokeCap = StrokeCap.round
            ..strokeWidth = 3.2 * fade + 0.6
            ..color = p.color.withValues(alpha: fade);
          canvas.drawLine(
              Offset(p.x - dx, p.y - dy), Offset(p.x, p.y), _paint);
        case ParticleKind.star:
          final s = p.size * (1 - 0.5 * t);
          _paint
            ..style = PaintingStyle.fill
            ..color = p.color.withValues(alpha: fade);
          canvas.save();
          canvas.translate(p.x, p.y);
          canvas.rotate(p.rot);
          canvas.scale(s);
          canvas.drawPath(_star, _paint);
          canvas.restore();
        case ParticleKind.shard:
          final s = p.size * (1 - 0.35 * t);
          canvas.save();
          canvas.translate(p.x, p.y);
          canvas.rotate(p.rot);
          final img = image;
          if (img != null && p.src != null) {
            _paint
              ..style = PaintingStyle.fill
              ..color = Colors.white.withValues(alpha: fade)
              ..filterQuality = FilterQuality.low;
            canvas.drawImageRect(img, p.src!,
                Rect.fromCenter(center: Offset.zero, width: s, height: s),
                _paint);
          } else {
            _paint
              ..style = PaintingStyle.fill
              ..color = p.color.withValues(alpha: fade);
            canvas.scale(s * 0.6);
            canvas.drawPath(_shard, _paint);
          }
          canvas.restore();
      }
    }
  }

  @override
  bool shouldRepaint(ParticlePainter oldDelegate) =>
      oldDelegate.image != image || oldDelegate.system != system;
}
