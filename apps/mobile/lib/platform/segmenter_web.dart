import 'dart:async';
import 'dart:js_interop';
import 'dart:typed_data';

import 'segmenter.dart';

Segmenter createPlatformSegmenter() => WebSegmenter();

/// `window.clickerSeg`, defined by the module script in `web/index.html`.
@JS('clickerSeg')
external _ClickerSeg? get _clickerSeg;

/// Set to 'error' (with `clickerSegError`) by index.html if the bridge
/// could not be installed.
@JS('clickerSegError')
external JSString? get _clickerSegError;

extension type _ClickerSeg._(JSObject _) implements JSObject {
  external JSPromise<JSUint8Array> remove(
      JSUint8Array bytes, JSFunction onProgress);
  external JSPromise<JSAny?> warmUp();
}

class WebSegmenter extends Segmenter {
  WebSegmenter({this.bridgeTimeout = const Duration(seconds: 20)});

  final Duration bridgeTimeout;

  @override
  bool get isSupported => true;

  @override
  void warmUp() {
    _waitForBridge().then((seg) => seg.warmUp().toDart).ignore();
  }

  /// The module script may still be loading; poll briefly for it.
  Future<_ClickerSeg> _waitForBridge() async {
    final deadline = DateTime.now().add(bridgeTimeout);
    while (true) {
      final seg = _clickerSeg;
      if (seg != null) return seg;
      final err = _clickerSegError;
      if (err != null) {
        throw SegmenterException('배경 제거 모듈을 불러오지 못했어요: ${err.toDart}');
      }
      if (DateTime.now().isAfter(deadline)) {
        throw const SegmenterException('배경 제거 모듈이 아직 준비되지 않았어요.');
      }
      await Future<void>.delayed(const Duration(milliseconds: 200));
    }
  }

  @override
  Future<Uint8List> removeBackground(
    Uint8List bytes, {
    void Function(double progress)? onProgress,
  }) async {
    final seg = await _waitForBridge();
    void progress(JSNumber v) => onProgress?.call(v.toDartDouble);
    try {
      final result = await seg.remove(bytes.toJS, progress.toJS).toDart;
      return result.toDart;
    } catch (e) {
      throw SegmenterException('배경 제거에 실패했어요: $e');
    }
  }
}
