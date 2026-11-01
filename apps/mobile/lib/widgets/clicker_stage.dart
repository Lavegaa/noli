import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:flutter/scheduler.dart';

import '../core/feel/feel_planner.dart';
import '../core/game/combo.dart';
import '../core/model/clicker_spec.dart';
import '../core/model/settings.dart';
import '../platform/haptics.dart';
import '../platform/sfx.dart';
import 'builtin_art.dart';
import 'clicker_art_view.dart';
import 'particles.dart';

/// Information about one press, delivered on pointer-down.
class TapInfo {
  const TapInfo({
    required this.pointer,
    required this.localPosition,
    required this.offset,
  });

  final int pointer;
  final Offset localPosition;

  /// Touch point relative to the clicker centre, each axis in -1..1.
  final Offset offset;
}

/// The "feel" renderer: 2.5D press, tilt, spring rebound, shake, particles,
/// sound and haptics. Shared by the create preview and the play screen.
///
/// Per-frame work is driven by a single [Ticker] that updates a
/// [ChangeNotifier]; only the transform wrapper rebuilds and painters repaint
/// via `repaint:`. The art widget itself is never rebuilt per frame.
class ClickerStage extends StatefulWidget {
  const ClickerStage({
    super.key,
    required this.spec,
    this.onTap,
    this.tier,
    this.accessibility = const AccessibilitySettings(),
    this.sfx = const SilentSfxPlayer(),
    this.haptics = const Haptics(),
    this.enabled = true,
    this.accentColor,
  });

  final ClickerSpec spec;

  /// Called first on every pointer-down (one call per finger), before the
  /// feel is planned, so a combo tier raised by this very tap applies to it.
  final ValueChanged<TapInfo>? onTap;

  /// Current combo tier (read right after [onTap]).
  final ValueListenable<ComboTier>? tier;
  final AccessibilitySettings accessibility;
  final SfxPlayer sfx;
  final Haptics haptics;

  /// When false, touches are ignored (e.g. challenge finished).
  final bool enabled;

  /// Colour for rings / glow; defaults to the theme's primary.
  final Color? accentColor;

  @override
  State<ClickerStage> createState() => _ClickerStageState();
}

enum _PressPhase { idle, pressing, held, releasing }

/// Mutable physics state for the stage, advanced by the ticker.
class _StageSim extends ChangeNotifier {
  _PressPhase phase = _PressPhase.idle;

  /// 0 = rest, 1 = fully pressed, < 0 = popped above rest (overshoot).
  double press = 0;
  double _pressFrom = 0;
  double _pressElapsed = 0;
  bool _releasePending = false;
  SpringSimulation? _spring;
  double _releaseElapsed = 0;

  FeelPlan? plan;
  double tiltX = 0, tiltY = 0; // degrees at full press

  double _shakeAmp = 0, _shakeT = 0;
  Offset _shakeDir = const Offset(1, 0);
  Offset shake = Offset.zero;

  double glow = 0;
  final ParticleSystem particles = ParticleSystem();

  static const _shakeTau = 0.075; // seconds
  static const _shakeHz = 27.0;
  static const _glowTau = 0.14;

  bool get settled =>
      phase == _PressPhase.idle &&
      press == 0 &&
      _shakeAmp == 0 &&
      glow < 0.01 &&
      particles.isEmpty;

  void down(FeelPlan p, math.Random rng) {
    plan = p;
    tiltX = p.tiltX;
    tiltY = p.tiltY;
    _pressFrom = press.clamp(0.0, 1.0);
    _pressElapsed = 0;
    _releasePending = false;
    _spring = null;
    phase = _PressPhase.pressing;

    if (p.shakeAmplitude > 0) {
      // Keep some of the current shake but never exceed the cap.
      final current = _shakeAmp * math.exp(-_shakeT / _shakeTau);
      _shakeAmp = math.min(FeelPlanner.maxShake,
          math.max(p.shakeAmplitude, current * 0.5 + p.shakeAmplitude * 0.6));
      _shakeT = 0;
      final a = rng.nextDouble() * math.pi * 2;
      _shakeDir = Offset(math.cos(a), math.sin(a) * 0.6);
    }
    if (p.pressDepth > 0) glow = 1;
  }

  void up() {
    if (phase == _PressPhase.pressing) {
      _releasePending = true; // let the 40ms press finish first
    } else if (phase == _PressPhase.held) {
      _startRelease();
    }
  }

  void _startRelease() {
    final p = plan;
    if (p == null) {
      press = 0;
      phase = _PressPhase.idle;
      return;
    }
    _spring = SpringSimulation(
      SpringDescription(
          mass: 1, stiffness: p.springStiffness, damping: p.springDamping),
      press,
      0,
      0,
      tolerance: const Tolerance(distance: 0.002, velocity: 0.02),
    );
    _releaseElapsed = 0;
    _releasePending = false;
    phase = _PressPhase.releasing;
  }

  void tick(double dt) {
    switch (phase) {
      case _PressPhase.idle || _PressPhase.held:
        break;
      case _PressPhase.pressing:
        _pressElapsed += dt;
        final dur =
            (plan?.pressDuration.inMicroseconds ?? 40000) / 1e6;
        final u = (_pressElapsed / dur).clamp(0.0, 1.0);
        final e = 1 - math.pow(1 - u, 3).toDouble(); // easeOutCubic
        press = _pressFrom + (1 - _pressFrom) * e;
        if (u >= 1) {
          press = 1;
          phase = _PressPhase.held;
          if (_releasePending) _startRelease();
        }
      case _PressPhase.releasing:
        _releaseElapsed += dt;
        final s = _spring!;
        press = s.x(_releaseElapsed);
        if (s.isDone(_releaseElapsed)) {
          press = 0;
          _spring = null;
          phase = _PressPhase.idle;
        }
    }

    if (_shakeAmp > 0) {
      _shakeT += dt;
      final env = _shakeAmp * math.exp(-_shakeT / _shakeTau);
      if (env < 0.08) {
        _shakeAmp = 0;
        shake = Offset.zero;
      } else {
        final w = 2 * math.pi * _shakeHz * _shakeT;
        final perp = Offset(-_shakeDir.dy, _shakeDir.dx);
        shake = _shakeDir * (env * math.sin(w)) +
            perp * (env * 0.35 * math.cos(w * 0.73));
      }
    }

    if (glow > 0) {
      glow *= math.exp(-dt / _glowTau);
      if (glow < 0.01) glow = 0;
    }
    particles.update(dt);
    notifyListeners();
  }

  void reset() {
    phase = _PressPhase.idle;
    press = 0;
    _shakeAmp = 0;
    shake = Offset.zero;
    glow = 0;
    particles.clear();
    notifyListeners();
  }
}

class _ClickerStageState extends State<ClickerStage>
    with SingleTickerProviderStateMixin {
  final _sim = _StageSim();
  final _rate = TapRate();
  final _rng = math.Random();
  final _down = ValueNotifier<bool>(false);
  final Set<int> _pointers = {};
  late final Ticker _ticker;
  Duration _lastElapsed = Duration.zero;

  ui.Image? _shardImage;
  int _decodeToken = 0;

  @override
  void initState() {
    super.initState();
    _ticker = createTicker(_onTick);
    _loadShardImage();
  }

  @override
  void didUpdateWidget(ClickerStage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.spec.idle != widget.spec.idle) _loadShardImage();
    if (!widget.enabled && oldWidget.enabled) _releaseAll();
  }

  @override
  void dispose() {
    _ticker.dispose();
    _sim.dispose();
    _down.dispose();
    _shardImage?.dispose();
    super.dispose();
  }

  Future<void> _loadShardImage() async {
    final token = ++_decodeToken;
    final art = widget.spec.idle;
    if (art is! ImageArt) {
      _setShardImage(null);
      return;
    }
    try {
      final codec = await ui.instantiateImageCodec(art.png);
      final frame = await codec.getNextFrame();
      codec.dispose();
      if (!mounted || token != _decodeToken) {
        frame.image.dispose();
        return;
      }
      _setShardImage(frame.image);
    } catch (_) {
      // Shards fall back to coloured fragments.
    }
  }

  void _setShardImage(ui.Image? image) {
    final old = _shardImage;
    if (!mounted) return;
    setState(() => _shardImage = image);
    old?.dispose();
  }

  void _onTick(Duration elapsed) {
    var dt = (elapsed - _lastElapsed).inMicroseconds / 1e6;
    _lastElapsed = elapsed;
    if (dt <= 0) return;
    dt = math.min(dt, 1 / 30); // avoid jumps after a stall
    _sim.tick(dt);
    if (_sim.settled && _pointers.isEmpty) {
      _ticker.stop();
    }
  }

  void _ensureTicking() {
    if (!_ticker.isActive) {
      _lastElapsed = Duration.zero;
      _ticker.start();
    }
  }

  // --- Input -------------------------------------------------------------

  void _onPointerDown(PointerDownEvent e, Rect artRect, double stageSide) {
    if (!widget.enabled) return;
    widget.sfx.unlock();
    _pointers.add(e.pointer);

    final center = artRect.center;
    final half = artRect.width / 2;
    final offset = Offset(
      ((e.localPosition.dx - center.dx) / half).clamp(-1.0, 1.0),
      ((e.localPosition.dy - center.dy) / half).clamp(-1.0, 1.0),
    );

    // 1. Let the game register the tap (may raise the tier).
    widget.onTap?.call(
        TapInfo(pointer: e.pointer, localPosition: e.localPosition, offset: offset));

    // 2. Plan the feel for this tap.
    final now = DateTime.now();
    _rate.add(now);
    final a11y = widget.accessibility;
    final feel = a11y.applyTo(widget.spec.feel);
    final tier = widget.tier?.value ?? ComboTier.calm;
    final plan = FeelPlanner.plan(
      feel,
      tier,
      _rate.perSecond(now),
      (x: offset.dx, y: offset.dy),
      shakeMultiplier: a11y.shakeMultiplier,
    );

    // 3. Visuals.
    _sim.down(plan, _rng);
    _down.value = true;
    if (plan.particleCount > 0) {
      final img = _shardImage;
      _sim.particles.burst(
        theme: feel.particles,
        at: e.localPosition,
        count: plan.particleCount,
        scale: stageSide / 300,
        accent: _accent,
        palette: switch (widget.spec.idle) {
          BuiltinArt(:final id) => BuiltinArtPainter.paletteFor(id),
          ImageArt() => const [],
        },
        imageSize: img == null
            ? null
            : Size(img.width.toDouble(), img.height.toDouble()),
      );
    }
    _ensureTicking();

    // 4. Sound & haptics.
    if (a11y.soundOn) {
      widget.sfx.playSwitch(widget.spec.sound.sw);
      widget.sfx.playEffect(widget.spec.sound.fx, semitones: plan.fxSemitones);
    }
    widget.haptics.play(plan.haptic);
  }

  void _onPointerUp(int pointer) {
    if (!_pointers.remove(pointer)) return;
    if (_pointers.isEmpty) _releaseAll();
  }

  void _releaseAll() {
    _pointers.clear();
    _down.value = false;
    _sim.up();
    _ensureTicking();
  }

  Color get _accent =>
      widget.accentColor ?? Theme.of(context).colorScheme.primary;

  // --- Build -------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final spec = widget.spec;
    final idle = RepaintBoundary(child: ClickerArtView(spec.idle));
    final pressed = spec.pressed == null
        ? null
        : RepaintBoundary(child: ClickerArtView(spec.pressed!));
    final art = pressed == null
        ? idle
        : ValueListenableBuilder<bool>(
            valueListenable: _down,
            builder: (_, down, _) => IndexedStack(
              index: down ? 1 : 0,
              sizing: StackFit.expand,
              children: [idle, pressed],
            ),
          );

    return LayoutBuilder(builder: (context, constraints) {
      final side = _side(constraints);
      final artSide = side * 0.78;
      final artRect = Rect.fromCenter(
        center: Offset(side / 2, side * 0.47),
        width: artSide,
        height: artSide,
      );
      return Center(
        child: SizedBox.square(
          dimension: side,
          child: Listener(
            behavior: HitTestBehavior.opaque,
            onPointerDown: (e) => _onPointerDown(e, artRect, side),
            onPointerUp: (e) => _onPointerUp(e.pointer),
            onPointerCancel: (e) => _onPointerUp(e.pointer),
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                // Glow + contact shadow (repaint only).
                Positioned.fill(
                  child: CustomPaint(
                    painter: _BackdropPainter(
                      sim: _sim,
                      artRect: artRect,
                      accent: _accent,
                      tier: widget.tier,
                    ),
                  ),
                ),
                Positioned.fromRect(
                  rect: artRect,
                  child: AnimatedBuilder(
                    animation: _sim,
                    child: art,
                    builder: (context, child) =>
                        _transformed(child!, artSide),
                  ),
                ),
                Positioned.fill(
                  child: IgnorePointer(
                    child: CustomPaint(
                      painter: ParticlePainter(
                        system: _sim.particles,
                        repaint: _sim,
                        image: _shardImage,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    });
  }

  double _side(BoxConstraints c) {
    final w = c.hasBoundedWidth ? c.maxWidth : 320.0;
    final h = c.hasBoundedHeight ? c.maxHeight : 320.0;
    return math.max(0, math.min(w, h));
  }

  Widget _transformed(Widget child, double artSide) {
    final plan = _sim.plan;
    final p = _sim.press;
    final depth = (plan?.pressDepth ?? 0) * p;
    final scale = 1 - (1 - (plan?.pressScale ?? 1)) * p;
    const deg = math.pi / 180;
    final m = Matrix4.identity()
      ..translateByDouble(_sim.shake.dx, _sim.shake.dy + depth, 0, 1)
      ..setEntry(3, 2, 0.0015)
      ..rotateX(_sim.tiltX * p * deg)
      ..rotateY(_sim.tiltY * p * deg)
      ..scaleByDouble(scale, scale, 1, 1);

    final pc = p.clamp(0.0, 1.0);
    // Light comes from the top-left; it shifts with tilt and dims when the
    // button sinks, while the bottom darkens.
    final lightShift = Alignment(
      (_sim.tiltY * p / FeelPlanner.maxTiltDegrees) * 0.6,
      (-_sim.tiltX * p / FeelPlanner.maxTiltDegrees) * 0.6,
    );
    return Transform(
      transform: m,
      alignment: Alignment.center,
      child: ShaderMask(
        blendMode: BlendMode.srcATop,
        shaderCallback: (rect) => LinearGradient(
          begin: Alignment.topLeft + lightShift,
          end: Alignment.bottomRight + lightShift,
          colors: [
            Colors.white.withValues(alpha: 0.22 * (1 - pc) + 0.03),
            Colors.white.withValues(alpha: 0.0),
            Colors.black.withValues(alpha: 0.04 + 0.20 * pc),
          ],
          stops: const [0.0, 0.45, 1.0],
        ).createShader(rect),
        child: child,
      ),
    );
  }
}

/// Glow behind the clicker and an elliptical contact shadow under it.
class _BackdropPainter extends CustomPainter {
  _BackdropPainter({
    required this.sim,
    required this.artRect,
    required this.accent,
    required this.tier,
  }) : super(repaint: sim);

  final _StageSim sim;
  final Rect artRect;
  final Color accent;
  final ValueListenable<ComboTier>? tier;

  @override
  void paint(Canvas canvas, Size size) {
    final p = sim.press;
    final pc = p.clamp(0.0, 1.0);
    final tierIndex = tier?.value.index ?? 0;

    // Aura grows with tier, flashes on impact.
    final aura = 0.06 * tierIndex + 0.35 * sim.glow;
    if (aura > 0.005) {
      final r = artRect.width * (0.55 + 0.12 * sim.glow + 0.05 * tierIndex);
      canvas.drawCircle(
        artRect.center,
        r,
        Paint()
          ..shader = RadialGradient(colors: [
            accent.withValues(alpha: aura.clamp(0.0, 0.6)),
            accent.withValues(alpha: 0),
          ]).createShader(Rect.fromCircle(center: artRect.center, radius: r)),
      );
    }

    // Shadow: shrinks and sharpens as the clicker sinks; widens on pop-up.
    final depth = (sim.plan?.pressDepth ?? 0) * p;
    final lift = 1 - pc * 0.55 + (p < 0 ? -p * 0.8 : 0);
    final w = artRect.width * (0.62 + 0.1 * lift) + sim.shake.dx.abs();
    final h = artRect.width * 0.12 * (0.7 + 0.3 * lift);
    final cy = artRect.bottom - artRect.height * 0.02 + depth * 0.4;
    canvas.drawOval(
      Rect.fromCenter(
          center: Offset(artRect.center.dx + sim.shake.dx * 0.3, cy),
          width: w,
          height: h),
      Paint()
        ..color = Colors.black.withValues(alpha: 0.18 + 0.14 * pc)
        ..maskFilter = MaskFilter.blur(BlurStyle.normal, 4 + 10 * lift),
    );
  }

  @override
  bool shouldRepaint(_BackdropPainter old) =>
      old.artRect != artRect || old.accent != accent || old.tier != tier;
}
