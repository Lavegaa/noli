import 'dart:js_interop';

import '../core/model/settings.dart';
import 'sfx.dart';

SfxPlayer createPlatformSfx() => WebSfxPlayer();

/// `window.clickerSfx`, defined in `web/index.html`. May be absent.
@JS('clickerSfx')
external _ClickerSfx? get _clickerSfx;

extension type _ClickerSfx._(JSObject _) implements JSObject {
  external void unlock();
  external void playSwitch(JSString name);
  external void playEffect(JSString name, JSNumber semitones);
}

class WebSfxPlayer implements SfxPlayer {
  void _guard(void Function(_ClickerSfx sfx) f) {
    final sfx = _clickerSfx;
    if (sfx == null) return;
    try {
      f(sfx);
    } catch (_) {
      // Audio must never break input handling.
    }
  }

  @override
  void unlock() => _guard((s) => s.unlock());

  @override
  void playSwitch(SwitchSound sound) {
    if (sound == SwitchSound.off) return;
    _guard((s) => s.playSwitch(sound.name.toJS));
  }

  @override
  void playEffect(EffectSound sound, {int semitones = 0}) {
    if (sound == EffectSound.off) return;
    _guard((s) => s.playEffect(sound.name.toJS, semitones.toJS));
  }
}
