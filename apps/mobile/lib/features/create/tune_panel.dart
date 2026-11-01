import 'package:flutter/material.dart';

import '../../core/model/settings.dart';
import '../labels.dart';

/// Feel & sound options; every change applies to the live preview at once.
class TunePanel extends StatelessWidget {
  const TunePanel({
    super.key,
    required this.feel,
    required this.sound,
    required this.onFeel,
    required this.onSound,
  });

  final FeelSettings feel;
  final SoundSettings sound;
  final ValueChanged<FeelSettings> onFeel;
  final ValueChanged<SoundSettings> onSound;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _Group<MotionPreset>(
          title: '모션',
          values: MotionPreset.values,
          selected: feel.preset,
          label: motionLabel,
          onSelected: (v) => onFeel(feel.copyWith(preset: v)),
        ),
        _Group<ParticleTheme>(
          title: '파티클',
          values: ParticleTheme.values,
          selected: feel.particles,
          label: particleLabel,
          onSelected: (v) => onFeel(feel.copyWith(particles: v)),
        ),
        _Group<ShakeLevel>(
          title: '흔들림',
          values: ShakeLevel.values,
          selected: feel.shake,
          label: shakeLabel,
          onSelected: (v) => onFeel(feel.copyWith(shake: v)),
        ),
        _Group<SwitchSound>(
          title: '스위치음',
          values: SwitchSound.values,
          selected: sound.sw,
          label: switchLabel,
          onSelected: (v) => onSound(sound.copyWith(sw: v)),
        ),
        _Group<EffectSound>(
          title: '효과음',
          values: EffectSound.values,
          selected: sound.fx,
          label: effectLabel,
          onSelected: (v) => onSound(sound.copyWith(fx: v)),
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('누른 곳으로 기울이기',
              style: TextStyle(fontWeight: FontWeight.w700)),
          value: feel.tilt,
          onChanged: (v) => onFeel(feel.copyWith(tilt: v)),
        ),
      ],
    );
  }
}

class _Group<T> extends StatelessWidget {
  const _Group({
    required this.title,
    required this.values,
    required this.selected,
    required this.label,
    required this.onSelected,
  });

  final String title;
  final List<T> values;
  final T selected;
  final String Function(T) label;
  final ValueChanged<T> onSelected;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final v in values)
                ChoiceChip(
                  label: Text(label(v)),
                  selected: v == selected,
                  onSelected: (_) => onSelected(v),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
