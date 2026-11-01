import 'dart:collection';

/// Injected time source so game logic is testable.
typedef Clock = DateTime Function();

DateTime systemClock() => DateTime.now();

enum ComboTier { calm, charged, wild, frenzy }

ComboTier tierForCombo(int combo) {
  if (combo >= 60) return ComboTier.frenzy;
  if (combo >= 30) return ComboTier.wild;
  if (combo >= 10) return ComboTier.charged;
  return ComboTier.calm;
}

class ComboState {
  const ComboState({
    required this.combo,
    required this.max,
    required this.tier,
    required this.previousTier,
  });

  static const initial = ComboState(
    combo: 0,
    max: 0,
    tier: ComboTier.calm,
    previousTier: ComboTier.calm,
  );

  final int combo;
  final int max;
  final ComboTier tier;
  final ComboTier previousTier;

  bool get tierChanged => tier != previousTier;
  bool get tierRaised => tier.index > previousTier.index;
}

class ComboEngine {
  ComboEngine({this.window = defaultWindow});

  static const defaultWindow = Duration(milliseconds: 600);

  final Duration window;
  DateTime? _last;
  ComboState _state = ComboState.initial;

  ComboState get state => _state;

  /// True when the next tap would start a new combo.
  bool isExpired(DateTime now) {
    final last = _last;
    return last == null || now.difference(last) > window;
  }

  ComboState tap(DateTime now) {
    final combo = isExpired(now) ? 1 : _state.combo + 1;
    _last = now;
    final tier = tierForCombo(combo);
    _state = ComboState(
      combo: combo,
      max: combo > _state.max ? combo : _state.max,
      tier: tier,
      previousTier: _state.tier,
    );
    return _state;
  }

  void reset() {
    _last = null;
    _state = ComboState.initial;
  }
}

/// Taps in the trailing window (default 1s).
class TapRate {
  TapRate({this.window = const Duration(seconds: 1)});

  final Duration window;
  final Queue<DateTime> _taps = Queue();

  void add(DateTime now) {
    _taps.addLast(now);
    _trim(now);
  }

  int perSecond(DateTime now) {
    _trim(now);
    return _taps.length;
  }

  void clear() => _taps.clear();

  void _trim(DateTime now) {
    while (_taps.isNotEmpty && now.difference(_taps.first) >= window) {
      _taps.removeFirst();
    }
  }
}
