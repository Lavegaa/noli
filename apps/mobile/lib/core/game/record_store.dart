import 'dart:async';

class ClickerRecord {
  const ClickerRecord({
    this.bestScore = 0,
    this.bestCombo = 0,
    this.totalTaps = 0,
  });

  /// Best 10-second challenge score (tap count).
  final int bestScore;
  final int bestCombo;
  final int totalTaps;

  @override
  bool operator ==(Object other) =>
      other is ClickerRecord &&
      other.bestScore == bestScore &&
      other.bestCombo == bestCombo &&
      other.totalTaps == totalTaps;

  @override
  int get hashCode => Object.hash(bestScore, bestCombo, totalTaps);

  @override
  String toString() =>
      'ClickerRecord(score: $bestScore, combo: $bestCombo, taps: $totalTaps)';
}

class SubmitResult {
  const SubmitResult({
    required this.record,
    required this.newBestScore,
    required this.newBestCombo,
  });

  final ClickerRecord record;
  final bool newBestScore;
  final bool newBestCombo;

  bool get isNewRecord => newBestScore || newBestCombo;
}

/// In-memory per-clicker records. Pure Dart; UI observes [changes].
class RecordStore {
  final Map<String, ClickerRecord> _records = {};
  final StreamController<String> _changes = StreamController.broadcast();

  /// Emits the clicker id whose record changed.
  Stream<String> get changes => _changes.stream;

  ClickerRecord get(String clickerId) =>
      _records[clickerId] ?? const ClickerRecord();

  /// [score] is null for free-mode runs (no score is kept for those).
  SubmitResult submit(
    String clickerId, {
    int? score,
    required int maxCombo,
    required int taps,
  }) {
    final prev = get(clickerId);
    final newBestScore = score != null && score > prev.bestScore;
    final newBestCombo = maxCombo > prev.bestCombo;
    final next = ClickerRecord(
      bestScore: newBestScore ? score : prev.bestScore,
      bestCombo: newBestCombo ? maxCombo : prev.bestCombo,
      totalTaps: prev.totalTaps + (taps > 0 ? taps : 0),
    );
    if (next != prev) {
      _records[clickerId] = next;
      _changes.add(clickerId);
    }
    return SubmitResult(
      record: next,
      newBestScore: newBestScore,
      newBestCombo: newBestCombo,
    );
  }

  void dispose() => _changes.close();
}
