import 'package:flutter/material.dart';

import '../core/model/clicker_spec.dart';
import 'builtin_art.dart';

/// Renders any [ClickerArt] into a square box.
class ClickerArtView extends StatelessWidget {
  const ClickerArtView(this.art, {super.key});
  final ClickerArt art;

  @override
  Widget build(BuildContext context) {
    return AspectRatio(
      aspectRatio: 1,
      child: switch (art) {
        ImageArt(:final png) => Image.memory(
            png,
            gaplessPlayback: true,
            fit: BoxFit.contain,
            filterQuality: FilterQuality.medium,
          ),
        BuiltinArt(:final id) =>
          CustomPaint(painter: BuiltinArtPainter(id), size: Size.infinite),
      },
    );
  }
}
