import 'package:flutter/material.dart';

import '../../core/model/settings.dart';
import '../labels.dart';

/// Global accessibility settings (override every clicker's feel).
class SettingsSheet extends StatelessWidget {
  const SettingsSheet({super.key, required this.settings});
  final ValueNotifier<AccessibilitySettings> settings;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: ValueListenableBuilder(
        valueListenable: settings,
        builder: (context, s, _) => Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: Text('접근성',
                    style: Theme.of(context).textTheme.titleLarge),
              ),
              SwitchListTile(
                title: const Text('모션'),
                subtitle: const Text('눌림·기울기·흔들림·파티클'),
                value: s.motionOn,
                onChanged: (v) => settings.value = s.copyWith(motionOn: v),
              ),
              SwitchListTile(
                title: const Text('사운드'),
                value: s.soundOn,
                onChanged: (v) => settings.value = s.copyWith(soundOn: v),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                child: Text('흔들림 강도',
                    style: Theme.of(context).textTheme.titleSmall),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: SizedBox(
                  width: double.infinity,
                  child: SegmentedButton<ShakeLevel>(
                    showSelectedIcon: false,
                    segments: [
                      for (final l in ShakeLevel.values)
                        ButtonSegment(value: l, label: Text(shakeLabel(l))),
                    ],
                    selected: {s.shake},
                    onSelectionChanged: s.motionOn
                        ? (v) => settings.value = s.copyWith(shake: v.first)
                        : null,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
