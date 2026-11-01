import 'combo.dart';

enum PlayMode { free, timed10 }

/// One play run. In [PlayMode.timed10] the clock starts at the first tap.
class PlaySession {
  PlaySession({
    required this.mode,
    Clock? clock,
    this.duration = const Duration(seconds: 10),
    Duration comboWindow = ComboEngine.defaultWindow,
  })  : clock = clock ?? systemClock,
        engine = ComboEngine(window: comboWindow);

  final PlayMode mode;
  final Clock clock;
  final Duration duration;
  final ComboEngine engine;
  final TapRate rate = TapRate();

  DateTime? _startedAt;
  int _score = 0;

  bool get isTimed => mode == PlayMode.timed10;
  bool get isStarted => _startedAt != null;
  int get score => _score;
  int get maxCombo => engine.state.max;

  /// Current combo, or 0 when the combo window has lapsed.
  int get liveCombo => engine.isExpired(clock()) ? 0 : engine.state.combo;

  /// Combo counter as of the last tap.
  int get combo => engine.state.combo;

  ComboTier get tier => engine.state.tier;

  int get tapsPerSecond => rate.perSecond(clock());

  Duration get elapsed =>
      _startedAt == null ? Duration.zero : clock().difference(_startedAt!);

  Duration get remaining {
    if (!isTimed) return Duration.zero;
    final left = duration - elapsed;
    return left.isNegative ? Duration.zero : left;
  }

  bool get isOver => isTimed && isStarted && elapsed >= duration;

  /// Registers a tap; returns null when the session is over.
  ComboState? tap() {
    if (isOver) return null;
    final now = clock();
    _startedAt ??= now;
    _score++;
    rate.add(now);
    return engine.tap(now);
  }
}
