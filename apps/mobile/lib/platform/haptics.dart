import 'package:flutter/services.dart';

import '../core/feel/feel_planner.dart';

/// Thin wrapper over [HapticFeedback] (no-op where unsupported, e.g. most
/// desktop browsers). Swappable for Core Haptics in the app.
class Haptics {
  const Haptics({this.enabled = true});
  final bool enabled;

  void play(HapticLevel level) {
    if (!enabled) return;
    switch (level) {
      case HapticLevel.none:
        return;
      case HapticLevel.light:
        HapticFeedback.lightImpact();
      case HapticLevel.medium:
        HapticFeedback.mediumImpact();
      case HapticLevel.heavy:
        HapticFeedback.heavyImpact();
    }
  }
}
