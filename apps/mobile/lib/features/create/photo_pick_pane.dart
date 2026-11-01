import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';

/// Photo source picker: gallery / camera via image_picker, plus bundled
/// sample photos (a test affordance: browser automation can't drive the OS
/// file dialog). Every source yields raw encoded bytes into the same pipeline.
class PhotoPickPane extends StatefulWidget {
  const PhotoPickPane({
    super.key,
    required this.title,
    required this.subtitle,
    required this.onPicked,
    this.secondaryAction,
  });

  static const samplePhotos = ['puppy1', 'puppy2', 'puppy3'];

  final String title;
  final String subtitle;
  final ValueChanged<Uint8List> onPicked;
  final Widget? secondaryAction;

  @override
  State<PhotoPickPane> createState() => _PhotoPickPaneState();
}

class _PhotoPickPaneState extends State<PhotoPickPane> {
  bool _busy = false;

  Future<void> _load(Future<Uint8List?> Function() source) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final bytes = await source();
      if (bytes != null && mounted) widget.onPicked(bytes);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('사진을 불러오지 못했어요: $e')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<Uint8List?> _pick(ImageSource source) async {
    final file = await ImagePicker().pickImage(source: source);
    return file?.readAsBytes();
  }

  Future<Uint8List?> _sample(String name) async {
    final data = await rootBundle.load('assets/sample_photos/$name.jpg');
    return data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ListView(
      padding: const EdgeInsets.fromLTRB(24, 24, 24, 32),
      children: [
        Container(
          height: 168,
          decoration: BoxDecoration(
            color: theme.colorScheme.primary.withValues(alpha: 0.10),
            borderRadius: BorderRadius.circular(32),
          ),
          child: Icon(Icons.photo_camera_back_rounded,
              size: 72, color: theme.colorScheme.primary),
        ),
        const SizedBox(height: 24),
        Text(widget.title, style: theme.textTheme.headlineMedium),
        const SizedBox(height: 8),
        Text(widget.subtitle,
            style: theme.textTheme.bodyLarge?.copyWith(
                height: 1.5, color: theme.colorScheme.onSurfaceVariant)),
        const SizedBox(height: 24),
        FilledButton.icon(
          key: const ValueKey('pick-photo'),
          onPressed: _busy ? null : () => _load(() => _pick(ImageSource.gallery)),
          icon: const Icon(Icons.photo_library_rounded),
          label: const Text('사진 고르기'),
        ),
        const SizedBox(height: 10),
        OutlinedButton.icon(
          onPressed: _busy ? null : () => _load(() => _pick(ImageSource.camera)),
          icon: const Icon(Icons.camera_alt_rounded),
          label: const Text('카메라로 찍기'),
        ),
        if (widget.secondaryAction != null) ...[
          const SizedBox(height: 4),
          widget.secondaryAction!,
        ],
        const SizedBox(height: 28),
        Text('샘플 사진', style: theme.textTheme.titleMedium),
        const SizedBox(height: 10),
        Row(
          children: [
            for (final name in PhotoPickPane.samplePhotos) ...[
              Expanded(
                child: Semantics(
                  label: 'sample-photo-$name',
                  button: true,
                  child: AspectRatio(
                    aspectRatio: 1,
                    child: Material(
                      clipBehavior: Clip.antiAlias,
                      borderRadius: BorderRadius.circular(18),
                      child: Ink.image(
                        image: AssetImage('assets/sample_photos/$name.jpg'),
                        fit: BoxFit.cover,
                        child: InkWell(
                          key: ValueKey('sample-photo-$name'),
                          onTap: _busy ? null : () => _load(() => _sample(name)),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              if (name != PhotoPickPane.samplePhotos.last)
                const SizedBox(width: 10),
            ],
          ],
        ),
        if (_busy) ...[
          const SizedBox(height: 20),
          const Center(child: CircularProgressIndicator()),
        ],
      ],
    );
  }
}
