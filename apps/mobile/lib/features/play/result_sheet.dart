import 'package:flutter/material.dart';

import '../../core/game/record_store.dart';

class ResultSheet extends StatelessWidget {
  const ResultSheet({
    super.key,
    required this.score,
    required this.maxCombo,
    required this.result,
  });

  final int score;
  final int maxCombo;
  final SubmitResult result;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('시간 끝!', style: theme.textTheme.titleLarge),
            const SizedBox(height: 8),
            if (result.newBestScore)
              Chip(
                avatar: const Icon(Icons.emoji_events_rounded,
                    color: Color(0xFFFFB627)),
                label: const Text('신기록!'),
                backgroundColor: const Color(0xFFFFF0C2),
                side: BorderSide.none,
              ),
            Text('$score회',
                key: const ValueKey('result-score'),
                style: theme.textTheme.displayMedium?.copyWith(
                    fontWeight: FontWeight.w900,
                    color: theme.colorScheme.primary)),
            const SizedBox(height: 4),
            Text(
              '최고 콤보 $maxCombo · 내 최고 ${result.record.bestScore}회',
              style: theme.textTheme.titleSmall
                  ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                key: const ValueKey('retry'),
                autofocus: true,
                onPressed: () => Navigator.of(context).pop(true),
                icon: const Icon(Icons.replay_rounded),
                label: const Text('다시하기'),
              ),
            ),
            const SizedBox(height: 4),
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text('닫기'),
            ),
          ],
        ),
      ),
    );
  }
}
