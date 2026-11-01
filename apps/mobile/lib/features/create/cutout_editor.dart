import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../../core/imaging/imaging.dart';
import '../../core/model/clicker_spec.dart';
import '../../platform/imaging_io.dart';
import '../../platform/segmenter.dart';
import '../../widgets/checkerboard.dart';

enum _Phase { preparing, segmenting, ready, refining, failed, finishing }

/// Photo → AI background removal → tap-to-keep refinement → feather + crop.
/// Produces a centred square transparent PNG as [ImageArt].
class CutoutEditor extends StatefulWidget {
  const CutoutEditor({
    super.key,
    required this.source,
    required this.segmenter,
    required this.onDone,
    required this.onRepick,
    this.title = '사물만 남겨요',
  });

  static const maxSide = 1024;

  final Uint8List source;
  final Segmenter segmenter;
  final ValueChanged<ImageArt> onDone;
  final VoidCallback onRepick;
  final String title;

  @override
  State<CutoutEditor> createState() => _CutoutEditorState();
}

class _CutoutEditorState extends State<CutoutEditor> {
  _Phase _phase = _Phase.preparing;
  double _progress = 0;
  String? _error;

  RgbaImage? _orig;
  RgbaImage? _auto;
  RgbaImage? _clean; // erode -> decontaminate -> feather, shown + exported
  ui.Image? _origImage;
  ui.Image? _currentImage;
  bool _refined = false;

  @override
  void initState() {
    super.initState();
    _run();
  }

  @override
  void dispose() {
    _origImage?.dispose();
    _currentImage?.dispose();
    super.dispose();
  }

  Future<void> _run() async {
    setState(() {
      _phase = _Phase.preparing;
      _progress = 0;
      _error = null;
    });
    try {
      if (_orig == null) {
        final orig =
            await decodeToRgba(widget.source, maxSide: CutoutEditor.maxSide);
        final img = await rgbaToUiImage(orig);
        if (!mounted) return img.dispose();
        _orig = orig;
        _origImage = img;
      }
      final orig = _orig!;
      setState(() => _phase = _Phase.segmenting);
      // Send the downscaled photo: faster inference, same pixel grid.
      final input = await encodePng(orig);
      final cut = await widget.segmenter.removeBackground(
        input,
        onProgress: (p) {
          if (mounted) setState(() => _progress = p);
        },
      );
      final auto =
          await decodeToRgba(cut, width: orig.width, height: orig.height);
      if (contentBounds(auto) == null) {
        throw const SegmenterException('사진에서 사물을 찾지 못했어요.');
      }
      if (!mounted) return;
      _auto = auto;
      await _setCurrent(auto, refined: false);
      if (mounted) setState(() => _phase = _Phase.ready);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _phase = _Phase.failed;
        _error = switch (e) {
          SegmenterException(:final message) => message,
          UnsupportedError(:final message) => message ?? '$e',
          _ => '$e',
        };
      });
    }
  }

  /// Cleans [img] (erode 1 -> decontaminate -> feather) and shows the result.
  Future<void> _setCurrent(RgbaImage img, {required bool refined}) async {
    // Let any spinner/frame paint before the synchronous pixel work.
    await Future<void>.delayed(const Duration(milliseconds: 32));
    if (!mounted) return;
    final clean = featherAlpha(decontaminateEdges(erodeAlpha(img, radius: 1)));
    final ui.Image next = await rgbaToUiImage(clean);
    if (!mounted) return next.dispose();
    final old = _currentImage;
    setState(() {
      _clean = clean;
      _currentImage = next;
      _refined = refined;
    });
    old?.dispose();
  }

  Future<void> _onTap(Offset local, Size box) async {
    final auto = _auto;
    if (auto == null || _phase != _Phase.ready) return;
    final x = (local.dx / box.width * auto.width).floor();
    final y = (local.dy / box.height * auto.height).floor();
    final region = connectedAlphaRegion(auto, x, y);
    if (region == null) {
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(const SnackBar(
            content: Text('배경을 탭했어요. 남기고 싶은 사물을 탭해 주세요.')));
      return;
    }
    await _apply(region, refined: true);
  }

  /// Runs [_setCurrent] behind the spinner, then returns to [_Phase.ready].
  Future<void> _apply(RgbaImage img, {required bool refined}) async {
    setState(() => _phase = _Phase.refining);
    try {
      await _setCurrent(img, refined: refined);
    } finally {
      if (mounted) setState(() => _phase = _Phase.ready);
    }
  }

  /// [image] is already cleaned (or the untouched original for the
  /// "keep background" fallback); this only crops and encodes.
  Future<void> _finish(RgbaImage image) async {
    setState(() => _phase = _Phase.finishing);
    // Let the spinner paint before the synchronous pixel work.
    await Future<void>.delayed(const Duration(milliseconds: 32));
    try {
      final cropped = cropToContent(image) ?? image;
      final png = await encodePng(cropped);
      if (!mounted) return;
      widget.onDone(ImageArt(png, cropped.width, cropped.height));
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _phase = _Phase.failed;
        _error = '이미지를 정리하지 못했어요: $e';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(widget.title, style: theme.textTheme.headlineMedium),
          const SizedBox(height: 6),
          Text(_hint, style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurfaceVariant)),
          const SizedBox(height: 16),
          Expanded(child: Center(child: _preview(theme))),
          const SizedBox(height: 16),
          ..._actions(),
        ],
      ),
    );
  }

  String get _hint => switch (_phase) {
        _Phase.preparing => '사진을 준비하고 있어요.',
        _Phase.segmenting => 'AI가 배경을 지우고 있어요. 처음 한 번은 모델을 내려받느라 조금 걸려요.',
        _Phase.ready => _refined
            ? '좋아요! 다른 부분을 탭하면 그걸로 바꿔요.'
            : '여러 개가 남았다면, 남기고 싶은 사물을 탭하세요.',
        _Phase.failed => '자동 분리에 실패했어요.',
        _Phase.refining => '가장자리를 다듬는 중…',
        _Phase.finishing => '가장자리를 다듬는 중…',
      };

  Widget _preview(ThemeData theme) {
    final orig = _orig;
    if (orig == null || _origImage == null) {
      return const CircularProgressIndicator();
    }
    final showCut = _currentImage != null &&
        (_phase == _Phase.ready ||
            _phase == _Phase.refining ||
            _phase == _Phase.finishing);
    return AspectRatio(
      aspectRatio: orig.width / orig.height,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(20),
        child: LayoutBuilder(builder: (context, c) {
          final box = Size(c.maxWidth, c.maxHeight);
          return GestureDetector(
            key: const ValueKey('cutout-canvas'),
            onTapUp: (d) => _onTap(d.localPosition, box),
            child: Stack(
              fit: StackFit.expand,
              children: [
                const CustomPaint(painter: CheckerboardPainter()),
                if (showCut)
                  RawImage(image: _currentImage, fit: BoxFit.fill)
                else
                  Opacity(
                    opacity: _phase == _Phase.failed ? 1 : 0.6,
                    child: RawImage(image: _origImage, fit: BoxFit.fill),
                  ),
                if (_phase == _Phase.segmenting ||
                    _phase == _Phase.preparing ||
                    _phase == _Phase.refining ||
                    _phase == _Phase.finishing)
                  Center(child: _progressBadge(theme)),
              ],
            ),
          );
        }),
      ),
    );
  }

  Widget _progressBadge(ThemeData theme) {
    final p = _phase == _Phase.segmenting && _progress > 0 ? _progress : null;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.92),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox.square(
            dimension: 44,
            child: CircularProgressIndicator(value: p, strokeWidth: 5),
          ),
          if (p != null) ...[
            const SizedBox(height: 10),
            Text('${(p * 100).round()}%',
                style: theme.textTheme.titleMedium),
          ],
        ],
      ),
    );
  }

  List<Widget> _actions() {
    switch (_phase) {
      case _Phase.ready:
        return [
          Row(
            children: [
              TextButton.icon(
                onPressed: _refined
                    ? () => _apply(_auto!, refined: false)
                    : null,
                icon: const Icon(Icons.undo_rounded),
                label: const Text('되돌리기'),
              ),
              const Spacer(),
              TextButton(
                  onPressed: widget.onRepick, child: const Text('다른 사진')),
            ],
          ),
          const SizedBox(height: 4),
          FilledButton(
            key: const ValueKey('cutout-next'),
            onPressed: () => _finish(_clean!),
            child: const Text('다음'),
          ),
        ];
      case _Phase.failed:
        return [
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(_error!,
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ),
          FilledButton.icon(
            onPressed: _run,
            icon: const Icon(Icons.refresh_rounded),
            label: const Text('다시 시도'),
          ),
          const SizedBox(height: 8),
          OutlinedButton(
            onPressed: _orig == null ? null : () => _finish(_orig!),
            child: const Text('배경 그대로 사용'),
          ),
          TextButton(onPressed: widget.onRepick, child: const Text('다른 사진')),
        ];
      default:
        return [
          TextButton(onPressed: widget.onRepick, child: const Text('다른 사진')),
        ];
    }
  }
}
