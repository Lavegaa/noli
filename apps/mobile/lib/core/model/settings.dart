/// Feel / sound settings for a clicker. Pure Dart (no Flutter imports).
library;

enum MotionPreset { tactile, soft, bouncy }

enum ShakeLevel { low, normal, high }

enum ParticleTheme { sparks, stars, shards, none }

enum SwitchSound { clicky, tactile, thock, off }

enum EffectSound { pop, coin, boing, off }

/// Looks up an enum value by name, falling back to [fallback] for unknown or
/// missing names so that packs from newer versions still load.
T enumByName<T extends Enum>(List<T> values, Object? name, T fallback) {
  if (name is! String) return fallback;
  for (final v in values) {
    if (v.name == name) return v;
  }
  return fallback;
}

class FeelSettings {
  const FeelSettings({
    this.preset = MotionPreset.tactile,
    this.motionOn = true,
    this.shake = ShakeLevel.normal,
    this.particles = ParticleTheme.sparks,
    this.tilt = true,
  });

  final MotionPreset preset;
  final bool motionOn;
  final ShakeLevel shake;
  final ParticleTheme particles;
  final bool tilt;

  FeelSettings copyWith({
    MotionPreset? preset,
    bool? motionOn,
    ShakeLevel? shake,
    ParticleTheme? particles,
    bool? tilt,
  }) =>
      FeelSettings(
        preset: preset ?? this.preset,
        motionOn: motionOn ?? this.motionOn,
        shake: shake ?? this.shake,
        particles: particles ?? this.particles,
        tilt: tilt ?? this.tilt,
      );

  Map<String, Object?> toJson() => {
        'preset': preset.name,
        'motionOn': motionOn,
        'shake': shake.name,
        'particles': particles.name,
        'tilt': tilt,
      };

  factory FeelSettings.fromJson(Map<String, Object?> json) {
    const d = FeelSettings();
    return FeelSettings(
      preset: enumByName(MotionPreset.values, json['preset'], d.preset),
      motionOn: json['motionOn'] is bool ? json['motionOn'] as bool : d.motionOn,
      shake: enumByName(ShakeLevel.values, json['shake'], d.shake),
      particles:
          enumByName(ParticleTheme.values, json['particles'], d.particles),
      tilt: json['tilt'] is bool ? json['tilt'] as bool : d.tilt,
    );
  }

  @override
  bool operator ==(Object other) =>
      other is FeelSettings &&
      other.preset == preset &&
      other.motionOn == motionOn &&
      other.shake == shake &&
      other.particles == particles &&
      other.tilt == tilt;

  @override
  int get hashCode => Object.hash(preset, motionOn, shake, particles, tilt);

  @override
  String toString() => 'FeelSettings(${toJson()})';
}

class SoundSettings {
  const SoundSettings({
    this.sw = SwitchSound.clicky,
    this.fx = EffectSound.pop,
  });

  final SwitchSound sw;
  final EffectSound fx;

  SoundSettings copyWith({SwitchSound? sw, EffectSound? fx}) =>
      SoundSettings(sw: sw ?? this.sw, fx: fx ?? this.fx);

  Map<String, Object?> toJson() => {'switch': sw.name, 'effect': fx.name};

  factory SoundSettings.fromJson(Map<String, Object?> json) {
    const d = SoundSettings();
    return SoundSettings(
      sw: enumByName(SwitchSound.values, json['switch'], d.sw),
      fx: enumByName(EffectSound.values, json['effect'], d.fx),
    );
  }

  @override
  bool operator ==(Object other) =>
      other is SoundSettings && other.sw == sw && other.fx == fx;

  @override
  int get hashCode => Object.hash(sw, fx);

  @override
  String toString() => 'SoundSettings(${toJson()})';
}

/// App-wide accessibility switches. They override per-clicker feel.
class AccessibilitySettings {
  const AccessibilitySettings({
    this.motionOn = true,
    this.soundOn = true,
    this.shake = ShakeLevel.normal,
  });

  final bool motionOn;
  final bool soundOn;

  /// Global shake intensity, applied on top of the clicker's own level.
  final ShakeLevel shake;

  double get shakeMultiplier => shakeLevelFactor(shake);

  FeelSettings applyTo(FeelSettings feel) =>
      motionOn ? feel : feel.copyWith(motionOn: false);

  AccessibilitySettings copyWith({
    bool? motionOn,
    bool? soundOn,
    ShakeLevel? shake,
  }) =>
      AccessibilitySettings(
        motionOn: motionOn ?? this.motionOn,
        soundOn: soundOn ?? this.soundOn,
        shake: shake ?? this.shake,
      );

  @override
  bool operator ==(Object other) =>
      other is AccessibilitySettings &&
      other.motionOn == motionOn &&
      other.soundOn == soundOn &&
      other.shake == shake;

  @override
  int get hashCode => Object.hash(motionOn, soundOn, shake);
}

double shakeLevelFactor(ShakeLevel level) => switch (level) {
      ShakeLevel.low => 0.5,
      ShakeLevel.normal => 1.0,
      ShakeLevel.high => 1.5,
    };
