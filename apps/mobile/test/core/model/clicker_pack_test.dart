import 'dart:convert';
import 'dart:typed_data';

import 'package:clicker/core/model/model.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final created = DateTime.utc(2026, 10, 31, 12, 30);

  ClickerSpec imageSpec({bool withPressed = true}) => ClickerSpec(
        id: 'c1',
        name: '주먹',
        idle: ImageArt(Uint8List.fromList([1, 2, 3, 4]), 10, 12),
        pressed: withPressed
            ? ImageArt(Uint8List.fromList([9, 8, 7]), 10, 12)
            : null,
        feel: const FeelSettings(
          preset: MotionPreset.bouncy,
          motionOn: false,
          shake: ShakeLevel.high,
          particles: ParticleTheme.shards,
          tilt: false,
        ),
        sound: const SoundSettings(sw: SwitchSound.thock, fx: EffectSound.coin),
        createdAt: created,
      );

  Map<String, dynamic> viaJsonText(Map<String, dynamic> json) =>
      jsonDecode(jsonEncode(json)) as Map<String, dynamic>;

  group('ClickerPack', () {
    test('round-trips spec with idle and pressed images', () {
      final spec = imageSpec();
      final pack = ClickerPack(spec);
      final json = viaJsonText(pack.toJson());

      expect(json['format'], ClickerPack.formatId);
      expect(json['assets'], {'idle': 'idle.png', 'pressed': 'pressed.png'});
      expect(pack.assets.keys, unorderedEquals(['idle.png', 'pressed.png']));

      final restored = ClickerPack.fromJson(json, pack.assets).spec;
      expect(restored, spec);
      expect(restored.createdAt, created);
    });

    test('handles missing pressed art', () {
      final spec = imageSpec(withPressed: false);
      final pack = ClickerPack(spec);
      final json = viaJsonText(pack.toJson());

      expect(json['assets'], {'idle': 'idle.png'});
      expect(pack.assets.keys, ['idle.png']);
      final restored = ClickerPack.fromJson(json, pack.assets).spec;
      expect(restored.pressed, isNull);
      expect(restored, spec);
    });

    test('builtin art needs no asset files', () {
      final spec = ClickerSpec(
        id: 'sample',
        name: '빨간 버튼',
        idle: const BuiltinArt(BuiltinArt.bigRedButton),
        createdAt: created,
      );
      final pack = ClickerPack(spec);
      expect(pack.assets, isEmpty);
      final restored =
          ClickerPack.fromJson(viaJsonText(pack.toJson()), const {}).spec;
      expect(restored, spec);
      expect(restored.feel, const FeelSettings());
      expect(restored.sound, const SoundSettings());
    });

    test('throws FormatException when a referenced asset is missing', () {
      final pack = ClickerPack(imageSpec());
      expect(
        () => ClickerPack.fromJson(viaJsonText(pack.toJson()), const {}),
        throwsFormatException,
      );
    });

    test('throws FormatException for a foreign format', () {
      expect(
        () => ClickerPack.fromJson({'format': 'nope'}, const {}),
        throwsFormatException,
      );
    });

    test('unknown enum names fall back to defaults', () {
      final feel = FeelSettings.fromJson({
        'preset': 'wobbly',
        'motionOn': true,
        'shake': 'extreme',
        'particles': 'confetti',
        'tilt': true,
      });
      expect(feel, const FeelSettings());
    });
  });

  group('copyWith', () {
    test('ClickerSpec.copyWith can clear pressed art', () {
      final spec = imageSpec();
      expect(spec.copyWith(clearPressed: true).pressed, isNull);
      expect(spec.copyWith(name: 'x').pressed, spec.pressed);
      expect(spec.copyWith(name: 'x').name, 'x');
    });

    test('FeelSettings and SoundSettings copyWith', () {
      const feel = FeelSettings();
      expect(feel.copyWith(tilt: false).tilt, isFalse);
      expect(feel.copyWith(tilt: false).preset, feel.preset);
      const sound = SoundSettings();
      expect(sound.copyWith(fx: EffectSound.off).fx, EffectSound.off);
      expect(sound.copyWith(fx: EffectSound.off).sw, sound.sw);
    });
  });

  group('AccessibilitySettings', () {
    test('applies global motion switch and shake level to feel', () {
      const feel = FeelSettings(shake: ShakeLevel.high);
      const a11y = AccessibilitySettings(motionOn: false, shake: ShakeLevel.low);
      final effective = a11y.applyTo(feel);
      expect(effective.motionOn, isFalse);
      expect(a11y.shakeMultiplier, lessThan(1));
    });
  });
}
