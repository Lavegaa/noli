import 'dart:typed_data';

import 'clicker_spec.dart';
import 'settings.dart';

/// Distribution unit for the (future) market: `spec.json` + PNG assets.
///
/// [toJson] produces the spec metadata with asset *keys* (file names), and
/// [assets] holds the bytes for those keys.
class ClickerPack {
  const ClickerPack(this.spec);

  static const formatId = 'clicker-pack';
  static const formatVersion = 1;
  static const idleAsset = 'idle.png';
  static const pressedAsset = 'pressed.png';

  final ClickerSpec spec;

  Map<String, Object?> toJson() {
    final assetKeys = <String, String>{};
    if (spec.idle is ImageArt) assetKeys['idle'] = idleAsset;
    if (spec.pressed is ImageArt) assetKeys['pressed'] = pressedAsset;
    return {
      'format': formatId,
      'formatVersion': formatVersion,
      'spec': {
        'id': spec.id,
        'name': spec.name,
        'version': spec.version,
        'createdAt': spec.createdAt.toUtc().toIso8601String(),
        'idle': _artToJson(spec.idle, idleAsset),
        if (spec.pressed != null)
          'pressed': _artToJson(spec.pressed!, pressedAsset),
        'feel': spec.feel.toJson(),
        'sound': spec.sound.toJson(),
      },
      'assets': assetKeys,
    };
  }

  /// Asset file name → bytes, for every [ImageArt] in the spec.
  Map<String, Uint8List> get assets => {
        if (spec.idle case ImageArt(:final png)) idleAsset: png,
        if (spec.pressed case ImageArt(:final png)) pressedAsset: png,
      };

  factory ClickerPack.fromJson(
    Map<String, Object?> json,
    Map<String, Uint8List> assets,
  ) {
    if (json['format'] != formatId) {
      throw FormatException('Not a clicker pack: ${json['format']}');
    }
    final s = _map(json['spec'], 'spec');
    final createdAt = DateTime.tryParse('${s['createdAt']}');
    if (createdAt == null) {
      throw const FormatException('spec.createdAt is missing or invalid');
    }
    final spec = ClickerSpec(
      id: _string(s['id'], 'spec.id'),
      name: _string(s['name'], 'spec.name'),
      version: s['version'] is int ? s['version'] as int : 1,
      createdAt: createdAt,
      idle: _artFromJson(_map(s['idle'], 'spec.idle'), assets),
      pressed: s['pressed'] == null
          ? null
          : _artFromJson(_map(s['pressed'], 'spec.pressed'), assets),
      feel: s['feel'] is Map
          ? FeelSettings.fromJson(_map(s['feel'], 'spec.feel'))
          : const FeelSettings(),
      sound: s['sound'] is Map
          ? SoundSettings.fromJson(_map(s['sound'], 'spec.sound'))
          : const SoundSettings(),
    );
    return ClickerPack(spec);
  }

  static Map<String, Object?> _artToJson(ClickerArt art, String assetKey) =>
      switch (art) {
        ImageArt(:final width, :final height) => {
            'kind': 'image',
            'asset': assetKey,
            'width': width,
            'height': height,
          },
        BuiltinArt(:final id) => {'kind': 'builtin', 'id': id},
      };

  static ClickerArt _artFromJson(
    Map<String, Object?> json,
    Map<String, Uint8List> assets,
  ) {
    switch (json['kind']) {
      case 'builtin':
        return BuiltinArt(_string(json['id'], 'art.id'));
      case 'image':
        final key = _string(json['asset'], 'art.asset');
        final bytes = assets[key];
        if (bytes == null) throw FormatException('Missing asset: $key');
        final w = json['width'], h = json['height'];
        if (w is! int || h is! int) {
          throw const FormatException('Image art needs width/height');
        }
        return ImageArt(bytes, w, h);
      default:
        throw FormatException('Unknown art kind: ${json['kind']}');
    }
  }

  static Map<String, Object?> _map(Object? v, String field) {
    if (v is Map) return v.cast<String, Object?>();
    throw FormatException('$field must be an object');
  }

  static String _string(Object? v, String field) {
    if (v is String) return v;
    throw FormatException('$field must be a string');
  }
}
