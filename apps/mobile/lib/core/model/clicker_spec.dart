import 'dart:typed_data';

import 'settings.dart';

/// Visual of a clicker: an uploaded (cut-out) PNG or a built-in drawing.
sealed class ClickerArt {
  const ClickerArt();
}

final class ImageArt extends ClickerArt {
  const ImageArt(this.png, this.width, this.height);

  final Uint8List png;
  final int width;
  final int height;

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    if (other is! ImageArt ||
        other.width != width ||
        other.height != height ||
        other.png.length != png.length) {
      return false;
    }
    for (var i = 0; i < png.length; i++) {
      if (other.png[i] != png[i]) return false;
    }
    return true;
  }

  @override
  int get hashCode => Object.hash(width, height, png.length);

  @override
  String toString() => 'ImageArt(${width}x$height, ${png.length}B)';
}

final class BuiltinArt extends ClickerArt {
  const BuiltinArt(this.id);

  static const bigRedButton = 'big_red_button';
  static const keycap = 'keycap';

  final String id;

  @override
  bool operator ==(Object other) => other is BuiltinArt && other.id == id;

  @override
  int get hashCode => id.hashCode;

  @override
  String toString() => 'BuiltinArt($id)';
}

class ClickerSpec {
  const ClickerSpec({
    required this.id,
    required this.name,
    required this.idle,
    required this.createdAt,
    this.version = 1,
    this.pressed,
    this.feel = const FeelSettings(),
    this.sound = const SoundSettings(),
  });

  final String id;
  final String name;
  final int version;
  final ClickerArt idle;

  /// Optional art shown while pressed. When null, motion conveys the press.
  final ClickerArt? pressed;
  final FeelSettings feel;
  final SoundSettings sound;
  final DateTime createdAt;

  ClickerSpec copyWith({
    String? id,
    String? name,
    int? version,
    ClickerArt? idle,
    ClickerArt? pressed,
    bool clearPressed = false,
    FeelSettings? feel,
    SoundSettings? sound,
    DateTime? createdAt,
  }) =>
      ClickerSpec(
        id: id ?? this.id,
        name: name ?? this.name,
        version: version ?? this.version,
        idle: idle ?? this.idle,
        pressed: clearPressed ? null : (pressed ?? this.pressed),
        feel: feel ?? this.feel,
        sound: sound ?? this.sound,
        createdAt: createdAt ?? this.createdAt,
      );

  @override
  bool operator ==(Object other) =>
      other is ClickerSpec &&
      other.id == id &&
      other.name == name &&
      other.version == version &&
      other.idle == idle &&
      other.pressed == pressed &&
      other.feel == feel &&
      other.sound == sound &&
      other.createdAt == createdAt;

  @override
  int get hashCode =>
      Object.hash(id, name, version, idle, pressed, feel, sound, createdAt);

  @override
  String toString() => 'ClickerSpec($id, $name)';
}
