import '../core/game/combo.dart';
import '../core/model/settings.dart';

/// Korean UI labels for enums.
String motionLabel(MotionPreset v) => switch (v) {
      MotionPreset.tactile => '탄탄',
      MotionPreset.soft => '말랑',
      MotionPreset.bouncy => '통통',
    };

String particleLabel(ParticleTheme v) => switch (v) {
      ParticleTheme.sparks => '스파크',
      ParticleTheme.stars => '별',
      ParticleTheme.shards => '파편',
      ParticleTheme.none => '없음',
    };

String shakeLabel(ShakeLevel v) => switch (v) {
      ShakeLevel.low => '약하게',
      ShakeLevel.normal => '보통',
      ShakeLevel.high => '강하게',
    };

String switchLabel(SwitchSound v) => switch (v) {
      SwitchSound.clicky => '찰칵',
      SwitchSound.tactile => '톡',
      SwitchSound.thock => '도각',
      SwitchSound.off => '끔',
    };

String effectLabel(EffectSound v) => switch (v) {
      EffectSound.pop => '뽁',
      EffectSound.coin => '띠링',
      EffectSound.boing => '뿅',
      EffectSound.off => '끔',
    };

String tierLabel(ComboTier v) => switch (v) {
      ComboTier.calm => '잔잔',
      ComboTier.charged => '후끈',
      ComboTier.wild => '폭주',
      ComboTier.frenzy => '광란',
    };
