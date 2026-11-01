import 'dart:async';
import 'dart:typed_data';
import 'dart:ui' as ui;

import '../core/imaging/imaging.dart';

/// Decodes encoded image bytes (PNG/JPEG/...) to straight RGBA.
/// If [maxSide] is given the image is downscaled so its long side fits.
/// If [width]/[height] are given the image is decoded at exactly that size.
Future<RgbaImage> decodeToRgba(
  Uint8List bytes, {
  int? maxSide,
  int? width,
  int? height,
}) async {
  final image = await decodeToUiImage(bytes,
      maxSide: maxSide, width: width, height: height);
  try {
    return await uiImageToRgba(image);
  } finally {
    image.dispose();
  }
}

Future<ui.Image> decodeToUiImage(
  Uint8List bytes, {
  int? maxSide,
  int? width,
  int? height,
}) async {
  final buffer = await ui.ImmutableBuffer.fromUint8List(bytes);
  final codec = await ui.instantiateImageCodecWithSize(
    buffer,
    getTargetSize: (w, h) {
      if (width != null && height != null) {
        return ui.TargetImageSize(width: width, height: height);
      }
      if (maxSide != null) {
        final (tw, th) = fitTo(w, h, maxSide);
        if (tw != w || th != h) {
          return ui.TargetImageSize(width: tw, height: th);
        }
      }
      return const ui.TargetImageSize();
    },
  );
  try {
    return (await codec.getNextFrame()).image;
  } finally {
    codec.dispose();
  }
}

Future<RgbaImage> uiImageToRgba(ui.Image image) async {
  ByteData? data;
  try {
    data = await image.toByteData(format: ui.ImageByteFormat.rawStraightRgba);
  } catch (_) {
    data = null;
  }
  data ??= await image.toByteData(format: ui.ImageByteFormat.rawRgba);
  if (data == null) throw StateError('Could not read image pixels');
  return RgbaImage(
    image.width,
    image.height,
    data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes),
  );
}

Future<ui.Image> rgbaToUiImage(RgbaImage img) {
  final completer = Completer<ui.Image>();
  ui.decodeImageFromPixels(
    img.data,
    img.width,
    img.height,
    ui.PixelFormat.rgba8888,
    completer.complete,
  );
  return completer.future;
}

Future<Uint8List> encodePng(RgbaImage img) async {
  final image = await rgbaToUiImage(img);
  try {
    return await uiImageToPng(image);
  } finally {
    image.dispose();
  }
}

Future<Uint8List> uiImageToPng(ui.Image image) async {
  final data = await image.toByteData(format: ui.ImageByteFormat.png);
  if (data == null) throw StateError('PNG encoding failed');
  return data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes);
}
