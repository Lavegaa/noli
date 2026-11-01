import 'dart:typed_data';

import 'segmenter_stub.dart'
    if (dart.library.js_interop) 'segmenter_web.dart' as impl;

/// Removes the background from a photo, returning a transparent PNG.
abstract class Segmenter {
  /// Whether this platform has a working implementation.
  bool get isSupported;

  /// Starts loading the underlying library early (optional, best effort).
  void warmUp() {}

  /// [onProgress] receives 0..1 (model download + inference).
  Future<Uint8List> removeBackground(
    Uint8List bytes, {
    void Function(double progress)? onProgress,
  });
}

class SegmenterException implements Exception {
  const SegmenterException(this.message);
  final String message;
  @override
  String toString() => 'SegmenterException: $message';
}

/// Platform default: imgly (browser) on web, unsupported elsewhere for now.
Segmenter createSegmenter() => impl.createPlatformSegmenter();
