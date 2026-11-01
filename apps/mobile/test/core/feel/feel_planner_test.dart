import 'package:clicker/core/feel/feel_planner.dart';
import 'package:clicker/core/game/game.dart';
import 'package:clicker/core/model/model.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const center = (x: 0.0, y: 0.0);
  FeelPlan plan(
    FeelSettings s, {
    ComboTier tier = ComboTier.calm,
    double tps = 1,
    ({double x, double y}) offset = center,
    double shakeMultiplier = 1,
  }) =>
      FeelPlanner.plan(s, tier, tps, offset, shakeMultiplier: shakeMultiplier);

  test('motion off disables press, tilt, shake and particles', () {
    final p = plan(const FeelSettings(motionOn: false),
        tier: ComboTier.frenzy, offset: (x: 1, y: 1));
    expect(p.pressDepth, 0);
    expect(p.pressScale, 1);
    expect(p.tiltX, 0);
    expect(p.tiltY, 0);
    expect(p.shakeAmplitude, 0);
    expect(p.particleCount, 0);
    // Sound & haptics are not motion.
    expect(p.fxSemitones, 6);
    expect(p.haptic, HapticLevel.heavy);
  });

  test('tilt is proportional to offset and capped at 10 degrees', () {
    final half = plan(const FeelSettings(), offset: (x: 0.5, y: -0.5));
    expect(half.tiltY.abs(), closeTo(5, 1e-9));
    expect(half.tiltX.abs(), closeTo(5, 1e-9));
    final over = plan(const FeelSettings(), offset: (x: 3, y: -3));
    expect(over.tiltX.abs(), FeelPlanner.maxTiltDegrees);
    expect(over.tiltY.abs(), FeelPlanner.maxTiltDegrees);
    // Pressing the right side tilts it away: negative rotateY.
    expect(over.tiltY, lessThan(0));
    // Pressing the top (negative y) tilts the top away: negative rotateX.
    expect(over.tiltX, lessThan(0));
    final off = plan(const FeelSettings(tilt: false), offset: (x: 1, y: 1));
    expect(off.tiltX, 0);
    expect(off.tiltY, 0);
  });

  test('particles scale with tier and are capped at 24', () {
    const s = FeelSettings(preset: MotionPreset.bouncy);
    final calm = plan(s);
    final frenzy = plan(s, tier: ComboTier.frenzy);
    expect(frenzy.particleCount, greaterThan(calm.particleCount));
    expect(frenzy.particleCount, lessThanOrEqualTo(FeelPlanner.maxParticles));
    for (final preset in MotionPreset.values) {
      for (final tier in ComboTier.values) {
        expect(plan(FeelSettings(preset: preset), tier: tier).particleCount,
            lessThanOrEqualTo(24));
      }
    }
    expect(plan(const FeelSettings(particles: ParticleTheme.none)).particleCount,
        0);
  });

  test('shake halves above 8 taps per second and is capped', () {
    const s = FeelSettings(shake: ShakeLevel.high);
    final slow = plan(s, tier: ComboTier.wild, tps: 8);
    final fast = plan(s, tier: ComboTier.wild, tps: 9);
    expect(fast.shakeAmplitude, closeTo(slow.shakeAmplitude / 2, 1e-9));
    for (final tier in ComboTier.values) {
      final p = plan(const FeelSettings(preset: MotionPreset.bouncy,
              shake: ShakeLevel.high),
          tier: tier, shakeMultiplier: 1.5);
      expect(p.shakeAmplitude, lessThanOrEqualTo(FeelPlanner.maxShake));
    }
    expect(plan(const FeelSettings(shake: ShakeLevel.low)).shakeAmplitude,
        lessThan(plan(const FeelSettings()).shakeAmplitude));
  });

  test('preset differences', () {
    final tactile = plan(const FeelSettings(preset: MotionPreset.tactile));
    final soft = plan(const FeelSettings(preset: MotionPreset.soft));
    final bouncy = plan(const FeelSettings(preset: MotionPreset.bouncy));
    // Tactile: deep and short (stiff).
    expect(tactile.pressDepth, greaterThan(soft.pressDepth));
    expect(tactile.pressDepth, greaterThan(bouncy.pressDepth));
    expect(tactile.springStiffness, greaterThan(soft.springStiffness));
    // Soft: shallow, slow, fewer particles.
    expect(soft.particleCount, lessThan(tactile.particleCount));
    // Bouncy: largest overshoot and most particles.
    expect(bouncy.overshoot, greaterThan(tactile.overshoot));
    expect(bouncy.overshoot, greaterThan(soft.overshoot));
    expect(bouncy.particleCount, greaterThan(tactile.particleCount));
  });

  test('spring damping yields the requested overshoot (underdamped)', () {
    for (final preset in MotionPreset.values) {
      final p = plan(FeelSettings(preset: preset));
      final critical = 2 * _sqrt(p.springStiffness);
      expect(p.springDamping, lessThan(critical));
      expect(p.springDamping, greaterThan(0));
    }
  });

  test('effect pitch rises 2 semitones per tier; haptics by tier', () {
    expect(plan(const FeelSettings()).fxSemitones, 0);
    expect(plan(const FeelSettings(), tier: ComboTier.charged).fxSemitones, 2);
    expect(plan(const FeelSettings(), tier: ComboTier.wild).fxSemitones, 4);
    expect(plan(const FeelSettings()).haptic, HapticLevel.light);
    expect(plan(const FeelSettings(), tier: ComboTier.charged).haptic,
        HapticLevel.medium);
    expect(plan(const FeelSettings(), tier: ComboTier.wild).haptic,
        HapticLevel.heavy);
  });

  test('press scale never shrinks below 0.85', () {
    for (final tier in ComboTier.values) {
      expect(plan(const FeelSettings(), tier: tier).pressScale,
          greaterThanOrEqualTo(0.85));
      expect(plan(const FeelSettings(), tier: tier).pressScale, lessThan(1));
    }
  });
}

double _sqrt(double v) {
  var x = v;
  for (var i = 0; i < 40; i++) {
    x = 0.5 * (x + v / x);
  }
  return x;
}
