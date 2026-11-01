import 'package:clicker/app.dart';
import 'package:clicker/data/app_records.dart';
import 'package:clicker/data/app_scope.dart';
import 'package:clicker/data/clicker_repository.dart';
import 'package:clicker/platform/haptics.dart';
import 'package:clicker/platform/segmenter_stub.dart';
import 'package:clicker/platform/sfx.dart';
import 'package:clicker/widgets/clicker_stage.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

AppServices testServices() => AppServices(
      repository: InMemoryClickerRepository(),
      records: AppRecords(),
      segmenter: UnsupportedSegmenter(),
      sfx: const SilentSfxPlayer(),
      haptics: const Haptics(enabled: false),
    );

void main() {
  Future<void> pumpApp(WidgetTester tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(ClickerApp(services: testServices()));
    await tester.pumpAndSettle();
  }

  testWidgets('home lists both built-in samples and the market tab',
      (tester) async {
    await pumpApp(tester);
    expect(find.text('빅 레드 버튼'), findsOneWidget);
    expect(find.text('민트 키캡'), findsOneWidget);
    expect(find.text('만들기'), findsOneWidget);
    await tester.tap(find.text('마켓'));
    await tester.pumpAndSettle();
    expect(find.text('마켓 준비 중'), findsOneWidget);
  });

  testWidgets('sample clicker is playable: taps build a combo',
      (tester) async {
    await pumpApp(tester);
    await tester.tap(find.byKey(const ValueKey('clicker-card-sample-keycap')));
    await tester.pumpAndSettle();
    final stage = find.byType(ClickerStage);
    expect(stage, findsOneWidget);
    for (var i = 0; i < 3; i++) {
      await tester.tapAt(tester.getCenter(stage));
      await tester.pump(const Duration(milliseconds: 100));
    }
    final combo = tester.widget<Text>(find.byKey(const ValueKey('combo-value')));
    expect(combo.data, '3');
    await tester.pumpAndSettle();
  });

  testWidgets('create flow offers sample photos', (tester) async {
    await pumpApp(tester);
    await tester.tap(find.text('만들기'));
    await tester.pumpAndSettle();
    expect(find.text('사진 고르기'), findsOneWidget);
    for (final name in ['puppy1', 'puppy2', 'puppy3']) {
      expect(find.byKey(ValueKey('sample-photo-$name')), findsOneWidget);
      expect(find.bySemanticsLabel('sample-photo-$name'), findsOneWidget);
    }
  });
}
