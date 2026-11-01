import 'package:flutter/foundation.dart';

import '../core/model/model.dart';

/// Storage for the user's clickers. POC: memory only (lost on reload).
abstract class ClickerRepository {
  List<ClickerSpec> list();
  ClickerSpec? get(String id);

  /// Adds or replaces (same id) a clicker.
  void add(ClickerSpec spec);

  /// Notifies after every change.
  Listenable get changes;
}

class InMemoryClickerRepository extends ChangeNotifier
    implements ClickerRepository {
  InMemoryClickerRepository({bool seedSamples = true}) {
    if (seedSamples) {
      for (final s in samples()) {
        _items[s.id] = s;
      }
    }
  }

  static List<ClickerSpec> samples() {
    final t = DateTime.utc(2026, 10, 31);
    return [
      ClickerSpec(
        id: 'sample-big-red-button',
        name: '빅 레드 버튼',
        idle: const BuiltinArt(BuiltinArt.bigRedButton),
        feel: const FeelSettings(
            preset: MotionPreset.bouncy, particles: ParticleTheme.sparks),
        sound: const SoundSettings(sw: SwitchSound.thock, fx: EffectSound.pop),
        createdAt: t,
      ),
      ClickerSpec(
        id: 'sample-keycap',
        name: '민트 키캡',
        idle: const BuiltinArt(BuiltinArt.keycap),
        feel: const FeelSettings(
            preset: MotionPreset.tactile, particles: ParticleTheme.stars),
        sound:
            const SoundSettings(sw: SwitchSound.clicky, fx: EffectSound.coin),
        createdAt: t.subtract(const Duration(minutes: 1)),
      ),
    ];
  }

  final Map<String, ClickerSpec> _items = {};

  @override
  Listenable get changes => this;

  @override
  List<ClickerSpec> list() {
    final all = _items.values.toList()
      ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
    return all;
  }

  @override
  ClickerSpec? get(String id) => _items[id];

  @override
  void add(ClickerSpec spec) {
    _items[spec.id] = spec;
    notifyListeners();
  }
}
