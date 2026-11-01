import 'dart:async';

import 'package:flutter/foundation.dart';

import '../core/game/record_store.dart';

/// Exposes the pure-Dart [RecordStore] as a [Listenable] for widgets.
class AppRecords extends ChangeNotifier {
  AppRecords([RecordStore? store]) : store = store ?? RecordStore() {
    _sub = this.store.changes.listen((_) => notifyListeners());
  }

  final RecordStore store;
  late final StreamSubscription<String> _sub;

  ClickerRecord get(String id) => store.get(id);

  SubmitResult submit(String id,
          {int? score, required int maxCombo, required int taps}) =>
      store.submit(id, score: score, maxCombo: maxCombo, taps: taps);

  @override
  void dispose() {
    _sub.cancel();
    store.dispose();
    super.dispose();
  }
}
