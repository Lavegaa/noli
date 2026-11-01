# Clicker POC — 상세 설계 (Flutter)

> 상위 기획: [product brief](../product/2026-10-31-clicker-platform-product-brief.md)
> 이전 Codex 웹 POC(`../clicker`)는 참고만 하고, 설계는 처음부터 다시 잡는다.

## 1. POC가 검증할 가설

| # | 가설 | 성공 기준 |
|---|---|---|
| H1 제작 | 사진 한 장으로 쓸 만한 클릭커가 1분 안에 나온다 | 자동 분리 → (필요시) 탭 1회 보정 → 저장까지 화면 4개 이하 |
| H2 손맛 | 2.5D 프레스·반동·기울기·흔들림·파티클·사운드가 "계속 누르고 싶다"를 만든다 | 포인터 다운 즉시(다음 프레임) 시각 반응, 초당 10탭에서 60fps 유지 |
| H3 게임 | 콤보 + 10초 챌린지가 재도전 동기를 만든다 | 결과 화면에서 "다시" 1탭, 클릭커별 최고 기록 노출 |

## 2. 범위

**포함**
- 홈: 내 클릭커 목록(기본 샘플 2개 포함), 만들기 진입, 마켓 탭 자리(준비 중 화면)
- 만들기: 사진 선택 → AI 자동 분리 → 탭으로 대상 사물만 남기기 → (선택) 눌림 이미지 → 손맛 튜닝(실시간 미리보기) → 이름 짓고 저장
- 플레이: 자유 모드(무한 콤보) / 10초 챌린지, 결과 화면, 클릭커별 최고 기록
- 접근성: 모션 끄기, 사운드 끄기, 흔들림 강도 낮음/기본/강함

**제외 (인터페이스만 남김)**
- 계정·서버·마켓 실제 기능·랭킹·결제
- 영구 저장: POC는 메모리 저장소. 새로고침하면 사라진다. `ClickerRepository` 인터페이스로 분리해 alpha에서 교체
- 네이티브 분리(iOS Vision, Android ML Kit): `Segmenter` 인터페이스만, 웹 구현만 제공

**실행 타깃**: Flutter Web(Chrome). 같은 코드가 이후 iOS/Android 빌드 대상이다. 웹 전용 코드는 `platform/` 아래 조건부 import로 격리한다.

## 3. 구조

```
lib/
  core/                 # 순수 Dart. Flutter UI import 금지 → 단위 테스트 대상
    model/              # ClickerSpec, FeelSettings, SoundSettings, ClickerArt, ClickerPack(json)
    game/               # ComboEngine, PlaySession(모드·점수·타이머 상태)
    feel/               # FeelPlanner: (설정, 콤보 단계, 탭 속도) → FeelPlan
    imaging/            # RGBA 마스크 연산: 연결 영역, 페더, 내용 기준 크롭
  platform/             # 교체 가능한 어댑터
    segmenter.dart      # abstract Segmenter + web(JS interop) / stub
    sfx.dart            # abstract SfxPlayer + web(WebAudio 합성) / stub
    haptics.dart        # HapticFeedback 래퍼 (웹에선 무동작)
  data/                 # ClickerRepository(abstract) + InMemoryClickerRepository, RecordStore
  features/
    home/  create/  play/  market/
  widgets/
    clicker_stage.dart  # 손맛 렌더러 (핵심 위젯, 만들기 미리보기와 플레이에서 공용)
    particles.dart
  app.dart  main.dart
web/index.html          # imgly 배경 제거 + WebAudio 브리지 스크립트
```

- 상태 관리는 `ChangeNotifier`/`ValueNotifier`만 쓴다. POC 규모에서 별도 패키지는 쓰지 않는다.
- 내비게이션은 기본 `Navigator`만 쓴다.
- 외부 패키지는 `image_picker`(웹 지원) 하나로 시작한다. 그 외는 필요할 때만 추가한다.

## 4. 데이터 모델 (마켓 이식을 전제로)

```dart
ClickerSpec {
  String id; String name; int version = 1;
  ClickerArt idle; ClickerArt? pressed;        // pressed 없으면 모션으로 눌림 표현
  FeelSettings feel; SoundSettings sound;
  DateTime createdAt;
}
sealed ClickerArt = ImageArt(Uint8List png, int w, int h) | BuiltinArt(String id)
FeelSettings { MotionPreset preset /*tactile|soft|bouncy*/; bool motionOn; ShakeLevel shake /*low|normal|high*/;
               ParticleTheme particles /*sparks|stars|shards|none*/; bool tilt; }
SoundSettings { SwitchSound sw /*clicky|tactile|thock|off*/; EffectSound fx /*pop|coin|boing|off*/; }
```

`ClickerPack`은 마켓 배포 단위다. `toJson()`이 `spec.json`과 에셋 참조(`idle.png`, `pressed.png`)를 만든다. POC에서는 직렬화와 역직렬화를 왕복 테스트로만 검증한다.

## 5. 만들기 플로우

1. **사진 선택** (`image_picker`). 긴 변을 1024px로 줄인다.
2. **자동 분리**: `Segmenter.removeBackground(bytes, onProgress)` → 투명 PNG를 받는다.
   - 웹 구현: `web/index.html`의 모듈 스크립트가 `@imgly/background-removal`(CDN, 버전 고정)을 불러오고 `window.clickerSeg.remove(Uint8Array, progressCb) → Promise<Uint8Array>`를 노출한다. Dart는 `dart:js_interop`으로 호출한다.
   - 첫 실행 때 모델을 내려받으므로 진행률을 표시한다. 실패하면 재시도 버튼을 보여준다.
3. **탭 보정**: 원본 위를 탭하면 AI 결과 알파 마스크에서 탭한 점과 연결된 영역만 남긴다(`imaging.connectedAlphaRegion`). 배경을 탭하면 안내 문구를 보여준다. "되돌리기"로 자동 분리 결과로 돌아간다.
4. **후처리** (자동): 1.5px 알파 페더 → 불투명 영역 기준으로 크롭하고 여백 8%를 둔다. 그래야 클릭커가 항상 가운데, 같은 크기로 보인다.
5. **눌림 이미지** (선택): 같은 파이프라인(2~4)을 한 번 더 거친다. 크기가 다르면 idle 이미지의 박스에 맞춘다.
6. **손맛 튜닝**: 상단에 `ClickerStage` 실시간 미리보기를 두고, 하단에서 모션 프리셋, 파티클, 기울기, 흔들림, 스위치음, 효과음을 고른다. 바꾸면 바로 반영된다.
7. **저장**: 이름을 입력하면 repo에 추가하고 바로 플레이 화면으로 간다.

픽셀 연산은 웹에서 isolate를 쓸 수 없으므로 메인 스레드에서 처리한다. 1024²에서 100ms 이하를 목표로 하고, 처리 중에는 스피너를 보여준다. 디코딩과 인코딩은 `dart:ui`(`decodeImageFromList`, `toByteData(rawRgba/png)`)로 하고 추가 패키지는 쓰지 않는다.

## 6. 손맛 엔진 (`ClickerStage` + `FeelPlanner`)

**입력**
- `Listener.onPointerDown`에서 즉시 처리한다. 탭 제스처 판정 지연이 없게 하기 위함이다.
- 손가락마다 탭을 1회로 센다(멀티터치 연타 허용).
- 놓을 때 반동은 `onPointerUp`/`onPointerCancel`에서 처리한다. 눌린 상태로 남는 버그를 막는다.

**FeelPlan** (순수 함수: 설정 + 콤보 단계 + 최근 탭 속도 → 값)

| 요소 | 내용 |
|---|---|
| 프레스 | 아래로 `depth`px 이동, `1 - 0.05·k` 축소, 그림자 오프셋·블러 축소, 상단 하이라이트 감소. 40ms ease-out |
| 기울기 (2.5D) | 누른 지점이 중심에서 벗어난 정도에 비례해 `rotateX/Y` 최대 10°. 원근 `setEntry(3,2,0.0015)` |
| 반동 | 놓으면 `SpringSimulation`으로 원위치보다 살짝 위로 튀었다가 안정. 프리셋별 강성·감쇠 |
| 흔들림 | 감쇠 사인파, 진폭 = 기본값 × 강도 × 단계 배율. **초당 8탭을 넘으면 진폭 절반**, 상한 고정(멀미 방지) |
| 파티클 | 누른 지점에서 방사. 개수 = 프리셋 기본값 × 단계 배율, 상한 24. `shards`는 클릭커 이미지 조각 |
| 사운드 | 스위치음 + 효과음 두 레이어. 단계가 오를 때마다 효과음 피치 +2반음 |
| 햅틱 | 단계별 light / medium / heavy (웹에서는 무동작) |

프리셋 차이:
- Tactile: 깊고 짧은 반동
- Soft: 얕고 느린 반동, 파티클 적음
- Bouncy: 얕지만 오버슈트가 크고 파티클이 많음

**모션 끄기**를 켜면 프레스, 기울기, 흔들림, 파티클을 모두 끈다. 다만 눌림 이미지 교체와 숫자 피드백은 유지한다.

## 7. 게임 (`ComboEngine`, `PlaySession`)

- 콤보: 직전 탭 후 **600ms** 안에 다시 누르면 +1, 아니면 1부터 다시 시작한다(상수로 조정 가능).
- 단계: `calm` <10, `charged` 10–29, `wild` 30–59, `frenzy` 60+.
  - 단계가 오를 때 HUD 펄스와 배경 톤이 바뀐다.
- 모드
  - **자유**: 시간 제한 없음. 현재 콤보, 최고 콤보, 총 탭 수를 보여준다.
  - **10초 챌린지**: 첫 탭부터 10초를 잰다. 점수 = 탭 수, 함께 최고 콤보도 기록한다. 끝나면 결과 화면(점수, 최고 콤보, 신기록 여부, 다시하기)을 보여준다.
- `RecordStore`: 클릭커 id별로 최고 점수, 최고 콤보, 누적 탭을 메모리에 저장한다.
- 시간은 `Clock` 주입으로 테스트할 수 있게 한다.

## 8. 사운드 (웹)

`web/index.html`에 `window.clickerSfx`(WebAudio)를 둔다.
- 첫 사용자 제스처에서 `AudioContext.resume()`을 호출한다.
- 소리는 에셋 없이 합성한다.
  - clicky: 짧은 노이즈 버스트 + 고역 통과
  - tactile: 저역 노이즈
  - thock: 저음 사인 감쇠
  - pop / coin / boing: 톤 합성
- 앱 단계에서는 `SfxPlayer` 구현을 저지연 네이티브 오디오(`flutter_soloud`)와 녹음 샘플로 교체한다.

## 9. 테스트와 검증

- `core/` 단위 테스트:
  - 콤보 창과 단계
  - FeelPlanner: 모션 끄기, 상한, 고속 탭 감쇠
  - 마스크 연결 영역, 페더, 크롭
  - ClickerPack JSON 왕복
  - PlaySession 10초 종료(가짜 Clock)
- 위젯 테스트: `ClickerStage`가 pointer down마다 탭 콜백을 1회 호출하는지. 멀티 포인터일 때도 확인.
- `flutter analyze` 경고 0, `flutter build web` 성공.
- Chrome에서 수동 확인:
  - 샘플 클릭커 연타
  - 사진 → 분리 → 탭 보정 → 저장 → 10초 챌린지

## 10. 앱으로 갈 때 바뀌는 것

| 영역 | POC (웹) | 앱 |
|---|---|---|
| 분리 | imgly (브라우저) | **OS 내장 모델로 결정**: iOS 17+ `VNGenerateForegroundInstanceMaskRequest`(탭한 인스턴스 선택), Android ML Kit Subject Segmentation(Play 서비스가 모델 제공). 앱에 모델 번들 없음 → 용량 증가 없음. 플랫폼 채널(Pigeon) |
| 사운드 | WebAudio 합성 | flutter_soloud + 녹음 샘플 |
| 햅틱 | 없음 | HapticFeedback / Core Haptics |
| 저장 | 메모리 | 로컬 DB + 파일 → 이후 서버 동기화 |
| 마켓 | 자리만 | ClickerPack 업로드·다운로드 |

`core/`, `widgets/`, `features/`는 그대로 유지한다.

**분리 모델 결정 (2026-10-31)**: 자체 모델 번들·추가 다운로드 없이 OS 내장 분리만 쓴다. iOS 16 이하·Play 서비스 미탑재 기기 대응(최소 지원 버전 상향 또는 서버 분리)은 앱 단계에서 정한다.
