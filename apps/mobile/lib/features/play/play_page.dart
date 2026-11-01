import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/game/game.dart';
import '../../core/model/model.dart';
import '../../data/app_scope.dart';
import '../../theme.dart';
import '../../widgets/clicker_stage.dart';
import '../labels.dart';
import 'result_sheet.dart';
import 'settings_sheet.dart';

class PlayPage extends StatefulWidget {
  const PlayPage({super.key, required this.spec});
  final ClickerSpec spec;

  @override
  State<PlayPage> createState() => _PlayPageState();
}

class _PlayPageState extends State<PlayPage> {
  late AppServices _services;
  PlayMode _mode = PlayMode.free;
  late PlaySession _session = PlaySession(mode: _mode);
  final _tier = ValueNotifier(ComboTier.calm);
  final _hud = ValueNotifier(0); // bumps to rebuild only the HUD
  final _banner = ValueNotifier<(ComboTier, int)?>(null);
  Timer? _countdown;
  Timer? _comboExpiry;
  bool _submitted = false;
  bool _showingResult = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _services = AppScope.of(context);
  }

  @override
  void dispose() {
    _submitFree();
    _countdown?.cancel();
    _comboExpiry?.cancel();
    _tier.dispose();
    _hud.dispose();
    _banner.dispose();
    super.dispose();
  }

  void _submitFree() {
    if (_mode != PlayMode.free || _submitted || _session.score == 0) return;
    _submitted = true;
    _services.records.submit(widget.spec.id,
        maxCombo: _session.maxCombo, taps: _session.score);
  }

  void _newSession(PlayMode mode) {
    _submitFree();
    _countdown?.cancel();
    _comboExpiry?.cancel();
    setState(() {
      _mode = mode;
      _session = PlaySession(mode: mode);
      _submitted = false;
    });
    _tier.value = ComboTier.calm;
    _banner.value = null;
    _hud.value++;
  }

  void _onTap(TapInfo _) {
    final state = _session.tap();
    if (state == null) return;
    _tier.value = state.tier;
    if (state.tierRaised) {
      _banner.value = (state.tier, DateTime.now().microsecondsSinceEpoch);
    }
    if (_session.isTimed && _countdown == null) {
      _countdown = Timer.periodic(
          const Duration(milliseconds: 50), (_) => _onCountdown());
    }
    _comboExpiry?.cancel();
    _comboExpiry = Timer(
        _session.engine.window + const Duration(milliseconds: 20), () {
      _tier.value = ComboTier.calm;
      _hud.value++;
    });
    _hud.value++;
  }

  void _onCountdown() {
    if (_session.isOver) {
      _countdown?.cancel();
      _finishTimed();
    }
    _hud.value++;
  }

  Future<void> _finishTimed() async {
    if (_showingResult || _submitted) return;
    _submitted = true;
    _comboExpiry?.cancel();
    _tier.value = ComboTier.calm;
    final result = _services.records.submit(
      widget.spec.id,
      score: _session.score,
      maxCombo: _session.maxCombo,
      taps: _session.score,
    );
    setState(() => _showingResult = true);
    // Brief beat so a last frantic tap doesn't dismiss the sheet.
    await Future<void>.delayed(const Duration(milliseconds: 250));
    if (!mounted) return;
    final retry = await showModalBottomSheet<bool>(
      context: context,
      builder: (_) => ResultSheet(
        score: _session.score,
        maxCombo: _session.maxCombo,
        result: result,
      ),
    );
    if (!mounted) return;
    setState(() => _showingResult = false);
    if (retry ?? false) _newSession(PlayMode.timed10);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ValueListenableBuilder<ComboTier>(
      valueListenable: _tier,
      builder: (context, tier, child) => AnimatedContainer(
        duration: const Duration(milliseconds: 450),
        curve: Curves.easeOut,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: AppColors.tierGradient(tier),
          ),
        ),
        child: child,
      ),
      child: Scaffold(
        backgroundColor: Colors.transparent,
        appBar: AppBar(
          title: Text(widget.spec.name, overflow: TextOverflow.ellipsis),
          actions: [
            IconButton(
              tooltip: '접근성 설정',
              icon: const Icon(Icons.tune_rounded),
              onPressed: () => showModalBottomSheet<void>(
                context: context,
                builder: (_) =>
                    SettingsSheet(settings: _services.accessibility),
              ),
            ),
            const SizedBox(width: 8),
          ],
        ),
        body: SafeArea(
          top: false,
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: SizedBox(
                  width: double.infinity,
                  child: SegmentedButton<PlayMode>(
                    showSelectedIcon: false,
                    segments: const [
                      ButtonSegment(
                          value: PlayMode.free,
                          label: Text('자유'),
                          icon: Icon(Icons.all_inclusive_rounded)),
                      ButtonSegment(
                          value: PlayMode.timed10,
                          label: Text('10초 챌린지'),
                          icon: Icon(Icons.timer_rounded)),
                    ],
                    selected: {_mode},
                    onSelectionChanged: (s) => _newSession(s.first),
                  ),
                ),
              ),
              const SizedBox(height: 14),
              ValueListenableBuilder<int>(
                valueListenable: _hud,
                builder: (context, _, _) => _Hud(
                  session: _session,
                  record: _services.records.get(widget.spec.id),
                ),
              ),
              Expanded(
                child: Stack(
                  children: [
                    Positioned.fill(
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: ValueListenableBuilder(
                          valueListenable: _services.accessibility,
                          builder: (context, a11y, _) =>
                              ValueListenableBuilder<ComboTier>(
                            valueListenable: _tier,
                            builder: (context, tier, _) => ClickerStage(
                              key: const ValueKey('play-stage'),
                              spec: widget.spec,
                              tier: _tier,
                              accessibility: a11y,
                              sfx: _services.sfx,
                              haptics: _services.haptics,
                              enabled: !_session.isOver,
                              accentColor: AppColors.tierAccent(tier),
                              onTap: _onTap,
                            ),
                          ),
                        ),
                      ),
                    ),
                    Positioned(
                      top: 8,
                      left: 0,
                      right: 0,
                      child: IgnorePointer(
                        child: ValueListenableBuilder(
                          valueListenable: _banner,
                          builder: (context, b, _) => b == null
                              ? const SizedBox.shrink()
                              : _TierBanner(key: ValueKey(b.$2), tier: b.$1),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              ValueListenableBuilder<int>(
                valueListenable: _hud,
                builder: (context, _, _) => Padding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
                  child: SizedBox(
                    height: 52,
                    child: Center(child: _footer(theme)),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _footer(ThemeData theme) {
    if (_session.isOver && !_showingResult) {
      return FilledButton.icon(
        onPressed: () => _newSession(PlayMode.timed10),
        icon: const Icon(Icons.replay_rounded),
        label: const Text('다시하기'),
      );
    }
    final text = switch ((_mode, _session.isStarted)) {
      (PlayMode.timed10, false) => '누르는 순간 10초가 시작돼요!',
      (PlayMode.timed10, true) => '더 빨리, 더 많이!',
      (PlayMode.free, _) => '0.6초 안에 다시 누르면 콤보가 이어져요',
    };
    return Text(text,
        style: theme.textTheme.titleSmall
            ?.copyWith(color: theme.colorScheme.onSurfaceVariant));
  }
}

class _Hud extends StatelessWidget {
  const _Hud({required this.session, required this.record});
  final PlaySession session;
  final ClickerRecord record;

  @override
  Widget build(BuildContext context) {
    final combo = session.liveCombo;
    final tier = combo == 0 ? ComboTier.calm : session.tier;
    final timed = session.isTimed;
    final remaining = session.remaining.inMilliseconds / 1000;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Row(
        children: [
          Expanded(
            flex: 5,
            child: _StatTile(
              label: '콤보 · ${tierLabel(tier)}',
              color: AppColors.tierAccent(tier),
              child: _PulseNumber(value: combo, big: true),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            flex: 4,
            child: Column(
              children: [
                _StatTile(
                  label: timed ? '최고 점수' : '최고 콤보',
                  dense: true,
                  child: Text(
                    timed
                        ? '${record.bestScore > session.score || session.isOver ? record.bestScore : session.score}'
                        : '${record.bestCombo > session.maxCombo ? record.bestCombo : session.maxCombo}',
                    style: _num(context, 22),
                  ),
                ),
                const SizedBox(height: 8),
                _StatTile(
                  label: timed ? '남은 시간' : '총 탭',
                  dense: true,
                  child: Text(
                    timed
                        ? '${remaining.toStringAsFixed(1)}초 · ${session.score}회'
                        : '${session.score}',
                    style: _num(context, 22),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

TextStyle _num(BuildContext context, double size) => TextStyle(
      fontSize: size,
      fontWeight: FontWeight.w900,
      fontFeatures: const [FontFeature.tabularFigures()],
      color: Theme.of(context).colorScheme.onSurface,
      height: 1.1,
    );

class _StatTile extends StatelessWidget {
  const _StatTile({
    required this.label,
    required this.child,
    this.color,
    this.dense = false,
  });
  final String label;
  final Widget child;
  final Color? color;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      width: double.infinity,
      padding: EdgeInsets.symmetric(horizontal: 14, vertical: dense ? 8 : 14),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.72),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              style: theme.textTheme.labelMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: color ?? theme.colorScheme.onSurfaceVariant)),
          const SizedBox(height: 2),
          child,
        ],
      ),
    );
  }
}

/// A number that pops on every increase (works with motion off too: it's
/// the numeric feedback, kept tiny).
class _PulseNumber extends StatefulWidget {
  const _PulseNumber({required this.value, this.big = false});
  final int value;
  final bool big;

  @override
  State<_PulseNumber> createState() => _PulseNumberState();
}

class _PulseNumberState extends State<_PulseNumber>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
      vsync: this, duration: const Duration(milliseconds: 160), value: 1);

  @override
  void didUpdateWidget(_PulseNumber old) {
    super.didUpdateWidget(old);
    if (widget.value > old.value) _c.forward(from: 0);
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (context, child) => Transform.scale(
        alignment: Alignment.centerLeft,
        scale: 1 + 0.22 * (1 - Curves.easeOut.transform(_c.value)),
        child: child,
      ),
      child: Text('${widget.value}',
          key: const ValueKey('combo-value'),
          style: _num(context, widget.big ? 56 : 22)),
    );
  }
}

class _TierBanner extends StatefulWidget {
  const _TierBanner({super.key, required this.tier});
  final ComboTier tier;

  @override
  State<_TierBanner> createState() => _TierBannerState();
}

class _TierBannerState extends State<_TierBanner>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
      vsync: this, duration: const Duration(milliseconds: 900))
    ..forward();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (context, child) {
        final t = _c.value;
        final scale = t < 0.2
            ? 0.6 + 0.6 * Curves.easeOutBack.transform(t / 0.2)
            : 1.2 - 0.2 * ((t - 0.2) / 0.8);
        final opacity = t < 0.7 ? 1.0 : 1 - (t - 0.7) / 0.3;
        return Opacity(
          opacity: opacity.clamp(0.0, 1.0),
          child: Transform.scale(scale: scale, child: child),
        );
      },
      child: Center(
        child: Text(
          '${tierLabel(widget.tier)}!',
          style: TextStyle(
            fontSize: 44,
            fontWeight: FontWeight.w900,
            color: AppColors.tierAccent(widget.tier),
            shadows: const [
              Shadow(color: Colors.white, blurRadius: 0, offset: Offset(0, 3)),
            ],
          ),
        ),
      ),
    );
  }
}
