import 'package:flutter/widgets.dart';

import '../core/model/settings.dart';
import '../platform/haptics.dart';
import '../platform/segmenter.dart';
import '../platform/sfx.dart';
import 'app_records.dart';
import 'clicker_repository.dart';

/// App-wide services. Swap implementations here for the native app.
class AppServices {
  AppServices({
    required this.repository,
    required this.records,
    required this.segmenter,
    required this.sfx,
    this.haptics = const Haptics(),
    AccessibilitySettings accessibility = const AccessibilitySettings(),
  }) : accessibility = ValueNotifier(accessibility);

  factory AppServices.platformDefault() => AppServices(
        repository: InMemoryClickerRepository(),
        records: AppRecords(),
        segmenter: createSegmenter(),
        sfx: createSfxPlayer(),
      );

  final ClickerRepository repository;
  final AppRecords records;
  final Segmenter segmenter;
  final SfxPlayer sfx;
  final Haptics haptics;
  final ValueNotifier<AccessibilitySettings> accessibility;
}

class AppScope extends InheritedWidget {
  const AppScope({super.key, required this.services, required super.child});

  final AppServices services;

  static AppServices of(BuildContext context) {
    final scope = context.getInheritedWidgetOfExactType<AppScope>();
    assert(scope != null, 'AppScope not found');
    return scope!.services;
  }

  @override
  bool updateShouldNotify(AppScope oldWidget) =>
      oldWidget.services != services;
}
