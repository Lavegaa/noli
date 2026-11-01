import 'package:clicker/core/game/game.dart';
import 'package:flutter_test/flutter_test.dart';

class FakeClock {
  FakeClock([DateTime? start]) : now = start ?? DateTime.utc(2026, 1, 1);
  DateTime now;
  DateTime call() => now;
  void advance(int ms) => now = now.add(Duration(milliseconds: ms));
}

void main() {
  group('tierForCombo', () {
    test('boundary values', () {
      expect(tierForCombo(0), ComboTier.calm);
      expect(tierForCombo(9), ComboTier.calm);
      expect(tierForCombo(10), ComboTier.charged);
      expect(tierForCombo(29), ComboTier.charged);
      expect(tierForCombo(30), ComboTier.wild);
      expect(tierForCombo(59), ComboTier.wild);
      expect(tierForCombo(60), ComboTier.frenzy);
      expect(tierForCombo(500), ComboTier.frenzy);
    });
  });

  group('ComboEngine', () {
    test('tap within 600ms (inclusive) increments, 601ms resets', () {
      final clock = FakeClock();
      final e = ComboEngine();
      expect(e.tap(clock()).combo, 1);
      clock.advance(600);
      expect(e.tap(clock()).combo, 2);
      clock.advance(601);
      final s = e.tap(clock());
      expect(s.combo, 1);
      expect(s.max, 2);
    });

    test('tierChanged fires when crossing into a new tier', () {
      final clock = FakeClock();
      final e = ComboEngine();
      ComboState? s;
      for (var i = 0; i < 9; i++) {
        s = e.tap(clock());
        expect(s.tierChanged, isFalse);
        clock.advance(100);
      }
      s = e.tap(clock());
      expect(s.combo, 10);
      expect(s.tier, ComboTier.charged);
      expect(s.tierChanged, isTrue);
      expect(s.tierRaised, isTrue);
      clock.advance(100);
      expect(e.tap(clock()).tierChanged, isFalse);
      clock.advance(1000);
      final reset = e.tap(clock());
      expect(reset.tier, ComboTier.calm);
      expect(reset.tierChanged, isTrue);
      expect(reset.tierRaised, isFalse);
    });

    test('isExpired reports a broken combo', () {
      final clock = FakeClock();
      final e = ComboEngine();
      expect(e.isExpired(clock()), isTrue);
      e.tap(clock());
      clock.advance(600);
      expect(e.isExpired(clock()), isFalse);
      clock.advance(1);
      expect(e.isExpired(clock()), isTrue);
    });
  });

  group('TapRate', () {
    test('counts taps within the last second', () {
      final clock = FakeClock();
      final r = TapRate();
      for (var i = 0; i < 10; i++) {
        r.add(clock());
        clock.advance(100);
      }
      // now = start + 1000ms; first tap at start is exactly 1s old -> dropped.
      expect(r.perSecond(clock()), 9);
      clock.advance(2000);
      expect(r.perSecond(clock()), 0);
    });
  });

  group('PlaySession', () {
    test('timed10 starts on first tap and ignores taps after 10s', () {
      final clock = FakeClock();
      final s = PlaySession(mode: PlayMode.timed10, clock: clock.call);
      expect(s.isStarted, isFalse);
      expect(s.remaining, const Duration(seconds: 10));
      clock.advance(5000); // waiting before the first tap doesn't count
      expect(s.remaining, const Duration(seconds: 10));

      expect(s.tap(), isNotNull);
      expect(s.isStarted, isTrue);
      clock.advance(4000);
      expect(s.remaining, const Duration(seconds: 6));
      s.tap();
      clock.advance(5999);
      expect(s.isOver, isFalse);
      s.tap(); // combo broken (>600ms) but still counts as score
      expect(s.score, 3);
      clock.advance(1);
      expect(s.isOver, isTrue);
      expect(s.remaining, Duration.zero);
      expect(s.tap(), isNull);
      expect(s.score, 3);
    });

    test('tracks max combo', () {
      final clock = FakeClock();
      final s = PlaySession(mode: PlayMode.timed10, clock: clock.call);
      for (var i = 0; i < 5; i++) {
        s.tap();
        clock.advance(100);
      }
      clock.advance(1000);
      s.tap();
      expect(s.combo, 1);
      expect(s.maxCombo, 5);
      expect(s.score, 6);
    });

    test('free mode never ends', () {
      final clock = FakeClock();
      final s = PlaySession(mode: PlayMode.free, clock: clock.call);
      s.tap();
      clock.advance(60000);
      expect(s.isOver, isFalse);
      expect(s.tap(), isNotNull);
      expect(s.score, 2);
    });
  });

  group('RecordStore', () {
    test('first submit is a record; equal is not; higher is', () {
      final store = RecordStore();
      expect(store.get('a'), const ClickerRecord());

      var r = store.submit('a', score: 20, maxCombo: 15, taps: 20);
      expect(r.newBestScore, isTrue);
      expect(r.newBestCombo, isTrue);
      expect(r.isNewRecord, isTrue);

      r = store.submit('a', score: 20, maxCombo: 10, taps: 20);
      expect(r.newBestScore, isFalse);
      expect(r.newBestCombo, isFalse);
      expect(r.record.totalTaps, 40);

      r = store.submit('a', score: 21, maxCombo: 16, taps: 21);
      expect(r.newBestScore, isTrue);
      expect(r.newBestCombo, isTrue);
      expect(store.get('a'),
          const ClickerRecord(bestScore: 21, bestCombo: 16, totalTaps: 61));
    });

    test('free-mode submit without score keeps best score', () {
      final store = RecordStore();
      store.submit('a', score: 30, maxCombo: 5, taps: 30);
      final r = store.submit('a', maxCombo: 50, taps: 100);
      expect(r.newBestScore, isFalse);
      expect(r.newBestCombo, isTrue);
      expect(store.get('a').bestScore, 30);
      expect(store.get('b'), const ClickerRecord());
    });

    test('zero-tap submit is never a record and notifies nothing', () async {
      final store = RecordStore();
      var events = 0;
      final sub = store.changes.listen((_) => events++);
      final r = store.submit('a', score: 0, maxCombo: 0, taps: 0);
      expect(r.isNewRecord, isFalse);
      store.submit('a', score: 1, maxCombo: 1, taps: 1);
      await Future<void>.delayed(Duration.zero);
      expect(events, 1);
      await sub.cancel();
    });
  });
}
