import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../../core/game/combo.dart';
import '../../core/model/model.dart';
import '../../data/app_scope.dart';
import '../../widgets/clicker_stage.dart';
import '../play/play_page.dart';
import 'cutout_editor.dart';
import 'photo_pick_pane.dart';
import 'tune_panel.dart';

enum CreateStep { pick, cutout, pressed, tune }

/// Step-by-step creation (state enum, no PageView):
/// photo → cut-out → (optional) pressed image → tune + name + save.
class CreatePage extends StatefulWidget {
  const CreatePage({super.key});

  @override
  State<CreatePage> createState() => _CreatePageState();
}

class _CreatePageState extends State<CreatePage> {
  CreateStep _step = CreateStep.pick;
  Uint8List? _idleSource;
  Uint8List? _pressedSource;
  ImageArt? _idle;
  ImageArt? _pressed;
  FeelSettings _feel = const FeelSettings();
  SoundSettings _sound = const SoundSettings();
  late final TextEditingController _name;

  final _previewCombo = ComboEngine();
  final _previewTier = ValueNotifier(ComboTier.calm);

  @override
  void initState() {
    super.initState();
    final count = 1 +
        (AppScope.of(context).repository.list().where((s) => s.idle is ImageArt))
            .length;
    _name = TextEditingController(text: '내 클릭커 $count');
    AppScope.of(context).segmenter.warmUp();
  }

  @override
  void dispose() {
    _name.dispose();
    _previewTier.dispose();
    super.dispose();
  }

  void _back() {
    setState(() {
      switch (_step) {
        case CreateStep.pick:
          break;
        case CreateStep.cutout:
          _step = CreateStep.pick;
          _idleSource = null;
        case CreateStep.pressed:
          if (_pressedSource != null) {
            _pressedSource = null;
          } else {
            _step = CreateStep.cutout;
          }
        case CreateStep.tune:
          _step = CreateStep.pressed;
          _pressed = null;
          _pressedSource = null;
      }
    });
  }

  void _save() {
    final idle = _idle;
    if (idle == null) return;
    final name = _name.text.trim().isEmpty ? '내 클릭커' : _name.text.trim();
    final spec = ClickerSpec(
      id: 'c-${DateTime.now().microsecondsSinceEpoch}',
      name: name,
      idle: idle,
      pressed: _pressed,
      feel: _feel,
      sound: _sound,
      createdAt: DateTime.now(),
    );
    AppScope.of(context).repository.add(spec);
    Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => PlayPage(spec: spec)));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return PopScope(
      canPop: _step == CreateStep.pick,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _back();
      },
      child: Scaffold(
        appBar: AppBar(
          title: const Text('클릭커 만들기'),
          bottom: PreferredSize(
            preferredSize: const Size.fromHeight(28),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
              child: Row(
                children: [
                  Expanded(
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: LinearProgressIndicator(
                        minHeight: 8,
                        value: (_step.index + 1) / CreateStep.values.length,
                        backgroundColor:
                            theme.colorScheme.primary.withValues(alpha: 0.12),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Text(
                      '${_step.index + 1}/${CreateStep.values.length} '
                      '${_stepName(_step)}',
                      style: theme.textTheme.labelLarge),
                ],
              ),
            ),
          ),
        ),
        body: AnimatedSwitcher(
          duration: const Duration(milliseconds: 220),
          child: KeyedSubtree(
            key: ValueKey(
                '$_step-${identityHashCode(_idleSource)}-${identityHashCode(_pressedSource)}'),
            child: _body(),
          ),
        ),
      ),
    );
  }

  String _stepName(CreateStep s) => switch (s) {
        CreateStep.pick => '사진',
        CreateStep.cutout => '분리',
        CreateStep.pressed => '눌림',
        CreateStep.tune => '손맛',
      };

  Widget _body() {
    final services = AppScope.of(context);
    switch (_step) {
      case CreateStep.pick:
        return PhotoPickPane(
          title: '어떤 사물로 만들까요?',
          subtitle: '사진 한 장이면 충분해요. AI가 사물만 쏙 골라 클릭커로 만들어 줘요.',
          onPicked: (bytes) => setState(() {
            _idleSource = bytes;
            _step = CreateStep.cutout;
          }),
        );
      case CreateStep.cutout:
        return CutoutEditor(
          source: _idleSource!,
          segmenter: services.segmenter,
          onRepick: () => setState(() {
            _idleSource = null;
            _step = CreateStep.pick;
          }),
          onDone: (art) => setState(() {
            _idle = art;
            _step = CreateStep.pressed;
          }),
        );
      case CreateStep.pressed:
        final src = _pressedSource;
        if (src == null) {
          return PhotoPickPane(
            title: '누를 때 바뀔 이미지',
            subtitle: '선택 사항이에요. 예: 주먹 → 따봉.\n없으면 눌리는 모션으로 표현해요.',
            onPicked: (bytes) => setState(() => _pressedSource = bytes),
            secondaryAction: TextButton(
              key: const ValueKey('skip-pressed'),
              onPressed: () => setState(() {
                _pressed = null;
                _step = CreateStep.tune;
              }),
              child: const Text('건너뛰기'),
            ),
          );
        }
        return CutoutEditor(
          title: '눌림 이미지',
          source: src,
          segmenter: services.segmenter,
          onRepick: () => setState(() => _pressedSource = null),
          onDone: (art) => setState(() {
            _pressed = art;
            _step = CreateStep.tune;
          }),
        );
      case CreateStep.tune:
        return _tune();
    }
  }

  Widget _tune() {
    final services = AppScope.of(context);
    final theme = Theme.of(context);
    final draft = ClickerSpec(
      id: 'draft',
      name: _name.text,
      idle: _idle!,
      pressed: _pressed,
      feel: _feel,
      sound: _sound,
      createdAt: DateTime.now(),
    );
    return Column(
      children: [
        Container(
          height: 260,
          margin: const EdgeInsets.fromLTRB(16, 0, 16, 0),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(28),
            gradient: const LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0xFFFFF1E6), Color(0xFFFFD6C2)],
            ),
          ),
          child: Stack(
            children: [
              Positioned.fill(
                child: ValueListenableBuilder(
                  valueListenable: services.accessibility,
                  builder: (context, a11y, _) => ClickerStage(
                    spec: draft,
                    tier: _previewTier,
                    accessibility: a11y,
                    sfx: services.sfx,
                    haptics: services.haptics,
                    onTap: (_) => _previewTier.value =
                        _previewCombo.tap(DateTime.now()).tier,
                  ),
                ),
              ),
              Positioned(
                left: 0,
                right: 0,
                bottom: 10,
                child: IgnorePointer(
                  child: Text('눌러서 미리 느껴 보세요',
                      textAlign: TextAlign.center,
                      style: theme.textTheme.labelLarge?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant)),
                ),
              ),
            ],
          ),
        ),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
            children: [
              TunePanel(
                feel: _feel,
                sound: _sound,
                onFeel: (f) => setState(() => _feel = f),
                onSound: (s) => setState(() => _sound = s),
              ),
            ],
          ),
        ),
        Material(
          color: theme.colorScheme.surface,
          elevation: 8,
          child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      key: const ValueKey('clicker-name'),
                      controller: _name,
                      maxLength: 20,
                      textInputAction: TextInputAction.done,
                      onSubmitted: (_) => _save(),
                      decoration: const InputDecoration(
                        labelText: '이름',
                        counterText: '',
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.all(Radius.circular(16)),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  FilledButton(
                    key: const ValueKey('save-clicker'),
                    onPressed: _save,
                    child: const Text('저장하고 플레이'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}
