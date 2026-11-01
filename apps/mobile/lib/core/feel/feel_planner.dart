import 'dart:math' as math;

import '../game/combo.dart';
import '../model/settings.dart';

enum HapticLevel { none, light, medium, heavy }

/// Everything the stage needs to render one tap. Pure values.
class FeelPlan {
  const FeelPlan({
    required this.pressDepth,
    required this.pressScale,
    required this.pressDuration,
    required this.tiltX,
    required this.tiltY,
    required this.springStiffness,
    required this.springDamping,
    required this.overshoot,
    required this.shakeAmplitude,
    required this.particleCount,
    required this.fxSemitones,
    required this.haptic,
  });

  /// Downward travel in logical pixels at full press.
  final double pressDepth;

  /// Scale at full press (`1 - 0.05·k`).
  final double pressScale;
  final Duration pressDuration;

  /// Rotation about the X axis in degrees, as passed to `Matrix4.rotateX`
  /// with a positive perspective entry. Positive = bottom edge recedes.
  final double tiltX;

  /// Rotation about the Y axis in degrees (`Matrix4.rotateY`).
  /// Negative = right edge recedes.
  final double tiltY;

  /// Spring (mass 1) used for the release rebound.
  final double springStiffness;
  final double springDamping;

  /// Expected fraction the object pops past its rest position on release.
  final double overshoot;

  /// Peak shake offset in logical pixels.
  final double shakeAmplitude;
  final int particleCount;
  final int fxSemitones;
  final HapticLevel haptic;
}

class _Preset {
  const _Preset({
    required this.depth,
    required this.k,
    required this.stiffness,
    required this.overshoot,
    required this.particles,
    required this.shake,
  });
  final double depth;
  final double k;
  final double stiffness;
  final double overshoot;
  final int particles;
  final double shake;
}

abstract final class FeelPlanner {
  static const maxTiltDegrees = 10.0;
  static const maxParticles = 24;
  static const maxShake = 9.0;
  static const fastTapsPerSecond = 8.0;
  static const pressDuration = Duration(milliseconds: 40);

  static const _presets = {
    // Deep and short rebound.
    MotionPreset.tactile: _Preset(
        depth: 12, k: 1.0, stiffness: 1400, overshoot: 0.14, particles: 9,
        shake: 3.2),
    // Shallow, slow rebound, few particles.
    MotionPreset.soft: _Preset(
        depth: 6, k: 0.7, stiffness: 320, overshoot: 0.06, particles: 4,
        shake: 2.0),
    // Shallow but with a big overshoot and lots of particles.
    MotionPreset.bouncy: _Preset(
        depth: 8, k: 1.2, stiffness: 700, overshoot: 0.38, particles: 13,
        shake: 3.6),
  };

  static double _tierBoost(ComboTier tier) => switch (tier) {
        ComboTier.calm => 1.0,
        ComboTier.charged => 1.3,
        ComboTier.wild => 1.65,
        ComboTier.frenzy => 2.0,
      };

  static HapticLevel _haptic(ComboTier tier) => switch (tier) {
        ComboTier.calm => HapticLevel.light,
        ComboTier.charged => HapticLevel.medium,
        ComboTier.wild || ComboTier.frenzy => HapticLevel.heavy,
      };

  /// Damping (mass 1) giving an underdamped step response overshoot of [o].
  static double dampingForOvershoot(double stiffness, double o) {
    final l = math.log(o.clamp(1e-4, 0.95));
    final zeta = -l / math.sqrt(math.pi * math.pi + l * l);
    return 2 * zeta * math.sqrt(stiffness);
  }

  /// [tapOffset] is the touch point relative to the clicker centre, each
  /// axis normalised to -1..1 (values outside are clamped).
  static FeelPlan plan(
    FeelSettings settings,
    ComboTier tier,
    num tapsPerSecond,
    ({double x, double y}) tapOffset, {
    double shakeMultiplier = 1.0,
  }) {
    final p = _presets[settings.preset]!;
    final boost = _tierBoost(tier);
    final motion = settings.motionOn;
    final damping = dampingForOvershoot(p.stiffness, p.overshoot);
    final fx = tier.index * 2;
    final haptic = _haptic(tier);

    if (!motion) {
      return FeelPlan(
        pressDepth: 0,
        pressScale: 1,
        pressDuration: pressDuration,
        tiltX: 0,
        tiltY: 0,
        springStiffness: p.stiffness,
        springDamping: damping,
        overshoot: p.overshoot,
        shakeAmplitude: 0,
        particleCount: 0,
        fxSemitones: fx,
        haptic: haptic,
      );
    }

    final depthBoost = 1 + (boost - 1) * 0.35;
    final k = p.k * depthBoost;
    final pressScale = math.max(0.85, 1 - 0.05 * k);

    double tiltX = 0, tiltY = 0;
    if (settings.tilt) {
      final ox = tapOffset.x.clamp(-1.0, 1.0);
      final oy = tapOffset.y.clamp(-1.0, 1.0);
      tiltX = oy * maxTiltDegrees;
      tiltY = -ox * maxTiltDegrees;
    }

    var shake = p.shake *
        shakeLevelFactor(settings.shake) *
        shakeMultiplier *
        boost;
    if (tapsPerSecond > fastTapsPerSecond) shake /= 2;
    shake = math.min(shake, maxShake);

    final particles = settings.particles == ParticleTheme.none
        ? 0
        : math.min(maxParticles, (p.particles * boost).round());

    return FeelPlan(
      pressDepth: p.depth * depthBoost,
      pressScale: pressScale,
      pressDuration: pressDuration,
      tiltX: tiltX,
      tiltY: tiltY,
      springStiffness: p.stiffness,
      springDamping: damping,
      overshoot: p.overshoot,
      shakeAmplitude: shake,
      particleCount: particles,
      fxSemitones: fx,
      haptic: haptic,
    );
  }
}
