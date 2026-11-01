import 'dart:typed_data';

import 'segmenter.dart';

Segmenter createPlatformSegmenter() => UnsupportedSegmenter();

/// Native segmentation (iOS Vision / Android ML Kit) is out of POC scope.
class UnsupportedSegmenter extends Segmenter {
  @override
  bool get isSupported => false;

  @override
  Future<Uint8List> removeBackground(
    Uint8List bytes, {
    void Function(double progress)? onProgress,
  }) =>
      Future.error(UnsupportedError('이 플랫폼에서는 아직 자동 분리를 지원하지 않아요.'));
}
