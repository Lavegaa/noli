import 'package:clicker/core/game/combo.dart';
import 'package:clicker/core/model/model.dart';
import 'package:clicker/core/model/settings.dart' as s;
import 'package:clicker/platform/haptics.dart';
import 'package:clicker/platform/sfx.dart';
import 'package:clicker/widgets/clicker_stage.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class RecordingSfx implements SfxPlayer {
  final calls = <String>[];
  @override
  void unlock() => calls.add('unlock');
  @override
  void playSwitch(s.SwitchSound sound) => calls.add('switch:${sound.name}');
  @override
  void playEffect(s.EffectSound sound, {int semitones = 0}) =>
      calls.add('fx:${sound.name}:$semitones');
}

void main() {
  final spec = ClickerSpec(
    id: 't',
    name: 'test',
    idle: const BuiltinArt(BuiltinArt.bigRedButton),
    createdAt: DateTime.utc(2026),
    feel: const FeelSettings(particles: ParticleTheme.stars),
  );

  Future<List<TapInfo>> pumpStage(
    WidgetTester tester, {
    RecordingSfx? sfx,
    ValueListenable<ComboTier>? tier,
    AccessibilitySettings a11y = const AccessibilitySettings(),
  }) async {
    final taps = <TapInfo>[];
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Center(
          child: SizedBox.square(
            dimension: 300,
            child: ClickerStage(
              spec: spec,
              onTap: taps.add,
              tier: tier,
              accessibility: a11y,
              sfx: sfx ?? const SilentSfxPlayer(),
              haptics: const Haptics(enabled: false),
            ),
          ),
        ),
      ),
    ));
    return taps;
  }

  testWidgets('each pointer down calls onTap exactly once', (tester) async {
    final taps = await pumpStage(tester);
    final center = tester.getCenter(find.byType(ClickerStage));
    final g = await tester.startGesture(center);
    expect(taps, hasLength(1)); // on down, before up
    await tester.pump(const Duration(milliseconds: 16));
    await g.up();
    await tester.pumpAndSettle();
    expect(taps, hasLength(1));
  });

  testWidgets('two simultaneous pointers count as two taps', (tester) async {
    final taps = await pumpStage(tester);
    final center = tester.getCenter(find.byType(ClickerStage));
    final a = await tester.startGesture(center - const Offset(40, 0), pointer: 1);
    final b = await tester.startGesture(center + const Offset(40, 0), pointer: 2);
    expect(taps, hasLength(2));
    expect(taps[0].offset.dx, lessThan(0));
    expect(taps[1].offset.dx, greaterThan(0));
    await tester.pump(const Duration(milliseconds: 30));
    await a.up();
    await b.up();
    await tester.pumpAndSettle();
  });

  testWidgets('works again after release, and cancel does not stick',
      (tester) async {
    final taps = await pumpStage(tester);
    final center = tester.getCenter(find.byType(ClickerStage));
    for (var i = 0; i < 5; i++) {
      await tester.tapAt(center);
      await tester.pump(const Duration(milliseconds: 20));
    }
    final g = await tester.startGesture(center);
    await g.cancel();
    await tester.pumpAndSettle();
    await tester.tapAt(center);
    await tester.pumpAndSettle();
    expect(taps, hasLength(7));
  });

  testWidgets('plays both sound layers with tier pitch; respects sound off',
      (tester) async {
    final sfx = RecordingSfx();
    final tier = ValueNotifier(ComboTier.wild);
    await pumpStage(tester, sfx: sfx, tier: tier);
    final center = tester.getCenter(find.byType(ClickerStage));
    await tester.tapAt(center);
    await tester.pumpAndSettle();
    expect(sfx.calls, ['unlock', 'switch:clicky', 'fx:pop:4']);

    final muted = RecordingSfx();
    await pumpStage(tester,
        sfx: muted, a11y: const AccessibilitySettings(soundOn: false));
    await tester.tapAt(center);
    await tester.pumpAndSettle();
    expect(muted.calls, ['unlock']);
  });
}
