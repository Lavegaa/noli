import '../core/model/settings.dart';
import 'sfx_stub.dart' if (dart.library.js_interop) 'sfx_web.dart' as impl;

/// Two-layer click sound: mechanical switch + themed effect.
abstract class SfxPlayer {
  /// Must be called from a user gesture before audio can play (web).
  void unlock();
  void playSwitch(SwitchSound sound);
  void playEffect(EffectSound sound, {int semitones = 0});
}

class SilentSfxPlayer implements SfxPlayer {
  const SilentSfxPlayer();
  @override
  void unlock() {}
  @override
  void playSwitch(SwitchSound sound) {}
  @override
  void playEffect(EffectSound sound, {int semitones = 0}) {}
}

/// WebAudio synth on web, silent elsewhere (app: flutter_soloud later).
SfxPlayer createSfxPlayer() => impl.createPlatformSfx();
