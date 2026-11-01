# v1 앱 체험판 (서버 없이) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 실기기(iOS/Android)에서 서버 없이 v1의 혼자 노는 루프를 끝까지 돌려볼 수 있는 앱을 만든다. 루프는 사진 → OS 내장 분리·얼굴 감지 → 스위치 장착 → 연타 → 일일 퀘스트 → 조각 뽑기 → 새 스위치 장착이다. 이걸로 "재미있는가"를 판단한다.

**Architecture:**
- 기존 POC(`apps/mobile`)의 `core/`, `widgets/clicker_stage.dart`, 만들기 흐름을 확장한다.
- 서버가 필요한 게임 상태(퀘스트·조각·뽑기·보유 스위치·기록)는 `GameBackend` 인터페이스 뒤에 두고, 이 계획에서는 기기 저장 구현 `LocalGameBackend`를 붙인다. 계획 3이 같은 인터페이스로 `RemoteGameBackend`를 붙인다.
- 클릭커는 기기 파일로 저장한다. 사진은 기기 밖으로 나가지 않는다.
- 분리와 얼굴 감지는 플랫폼별로 나눈다.
  - iOS: Swift(Vision)를 Pigeon으로 호출한다.
  - Android: ML Kit Flutter 패키지를 쓴다.
  - Web: 기존 imgly를 유지한다(데모용).

**Tech Stack:** Flutter 3.47 / Dart 3.13, Pigeon, `google_mlkit_subject_segmentation`, `google_mlkit_face_detection`, `flutter_soloud`, `path_provider`, `shared_preferences`, `uuid`. 각 패키지는 **배포된 지 2주 이상 된 최신 안정판**으로 고정하고, 쓰기 전에 Context7이나 pub.dev 문서에서 API를 확인한다.

**Spec:** `docs/product/2026-10-31-clicker-product-design.md` (§4 용어, §5 정보 구조, §6.1–6.6, §6.10, §7 v1). 서버 규칙과 수치는 `docs/superpowers/plans/2026-10-31-v1-server-foundation.md`의 Global Constraints와 Task 6·7을 **그대로** 따른다(나중에 서버로 바꿔도 체감이 같도록).

## Global Constraints

- 위치: `apps/mobile`. 기존 분석·테스트 52개는 계속 통과해야 한다. `flutter analyze`는 이슈 0이어야 한다.
- 최소 OS: iOS 17.0(`ios/Podfile`, Runner 배포 타깃). Android는 ML Kit 요구 minSdk를 따른다(문서 확인 후 `android/app/build.gradle`에 명시).
- UI 문구는 한국어이고 초등학생 눈높이로 쓴다. 폰트는 Pretendard(이미 번들됨).
- 사진과 클릭커 이미지는 기기 밖으로 보내지 않는다. 네트워크 호출은 웹 데모의 imgly CDN뿐이다.
- 수치(서버 계획과 동일): 기본 보관함 칸 6, 최대 30. 뽑기 1회 = 조각 5. 확률 common 70 / rare 22 / epic 7 / legend 1. 중복 환급 1/2/3/5. 천장 20회. 일일 퀘스트 4개, 퀘스트 풀은 서버 계획 Task 6 표와 동일. 하루는 KST 00:00에 시작.
- 스위치 카탈로그 id(서버 시드와 동일, 문자열 그대로):
  - 사운드: `clicky`, `tactile`, `thock`(common) · `pop`, `coin`(rare) · `boing`(epic) · `laser`(legend)
  - 이펙트: `press_basic`, `sparks`(common) · `stars`, `shards`(rare) · `spin90`(epic) · `aura`(legend)
  - 기본 보유: `clicky`, `press_basic`
- 손맛 상한(POC 설계 §6) 유지: 흔들림 상한, 초당 8탭 초과 시 흔들림 절반, 파티클 상한 24, 동시 재생 사운드 보이스 최대 8.
- 접근성 설정(모션 끄기, 사운드 끄기, 흔들림 약/보통/강)은 모든 이펙트에 적용된다.

## Review Focus

1. **만들다가 앱이 종료되거나 저장 중 실패**: 반쯤 저장된 클릭커가 칸을 차지하거나 목록에 깨진 채 나오면 안 된다. 임시 폴더에 쓰고 마지막에 rename(원자적 저장)하고, 앱을 시작할 때 고아 임시 폴더를 정리한다. → Task 1
2. **사물이 없는 사진, 또는 분리 실패**(하늘 사진, 너무 어두운 사진 등): 앱이 죽지 않고 "물체를 찾지 못했어요. 다른 사진으로 해볼까요?"를 보여주며 재시도할 수 있어야 한다. → Task 2
3. **여러 손가락으로 초당 10회 이상 연타 + 무거운 장착**(`aura` + `spin90` + 파티클): 상한이 지켜지고, 사운드 보이스가 8개를 넘지 않고, 회전 각도가 누적돼도 튀지 않아야 한다. → Task 3
4. **지원하지 않는 기기**(iOS 16 이하는 배포 타깃으로 차단되지만 Android에서 ML Kit 모듈 다운로드 실패·Play 서비스 없음): 안내 문구를 보여주고, 만들기를 막아도 샘플 클릭커와 플레이는 돼야 한다. → Task 2
5. **앱을 켜 둔 채 KST 자정을 넘김**: 홈으로 돌아오거나 앱이 다시 활성화될 때 퀘스트가 새 날로 바뀌어야 한다. → Task 4, 5

---

### Task 1: 앱 셸 · 기기 저장 · 보관함 칸

**Files:**
- Create: `lib/app_shell.dart`(하단 5탭), `lib/data/file_clicker_repository.dart`, `lib/data/clicker_repository_io.dart`·`_web.dart`(조건부 선택), `lib/features/me/me_page.dart`(보관함 그리드 + 설정), `lib/features/explore/explore_page.dart`(준비 중), `lib/features/ranking/ranking_page.dart`(Task 5에서 채움, 여기서는 자리만), `lib/features/create/slot_gate.dart`, `test/data/file_clicker_repository_test.dart`, `test/features/slot_gate_test.dart`
- Modify: `lib/app.dart`, `lib/data/clicker_repository.dart`, `lib/data/app_scope.dart`, `lib/features/home/home_page.dart`(Task 5 전까지 기존 내용 유지), `lib/features/market/market_page.dart`(삭제, 탐색 탭으로 대체), `pubspec.yaml`

**Interfaces:**
- Consumes: 기존 `ClickerSpec`, `ClickerPack.toJson/fromJson`, `InMemoryClickerRepository`
- Produces:
  - `abstract class ClickerRepository { Future<List<ClickerSpec>> list(); Future<void> save(ClickerSpec spec); Future<void> delete(String id); int get storageSlots; Listenable get changes; }`
  - `FileClickerRepository(Directory root, {int storageSlots = 6})`
    - 저장 구조: `<root>/clickers/<id>/spec.json`, `idle.png`, `pressed.png`
    - 쓰기: `<root>/clickers/.tmp-<id>/`에 쓴 뒤 rename한다.
    - `init()`에서 `.tmp-*`를 삭제한다.
  - 샘플 2개(`BuiltinArt`)는 보관함 칸을 차지하지 않는 "기본 클릭커"로 맨 앞에 표시한다. 기존 시드 동작을 유지한다.
  - `SlotGate.check(repo) → SlotGateResult { ok | full(canBuy: bool) }`
    - `canBuy = storageSlots < 30`
    - 가득 차면 시트를 띄운다. 선택지는 "지우고 만들기"(보관함 선택 → 기록 삭제 경고 → 삭제)와 "칸 늘리기"다. "칸 늘리기"는 v1 체험판에서 "곧 열려요" 안내만 하고, 결제는 계획 3에서 붙인다.
  - 하단 탭: 홈 · 탐색 · 만들기 · 랭킹 · 나. "만들기" 탭은 페이지가 아니라 `SlotGate` → 만들기 흐름을 push한다.

- [ ] **Step 1: 테스트 작성**
  - `file_clicker_repository_test.dart`(임시 디렉터리 사용)
    - save → 새 인스턴스로 list하면 같은 spec(이미지 바이트 포함)이 나온다
    - delete → 디렉터리가 없어진다
    - `.tmp-x` 폴더를 미리 만들고 `init()` → 사라진다
    - spec.json이 깨진 폴더는 list에서 건너뛰고 예외를 던지지 않는다
  - `slot_gate_test.dart`
    - 6칸에 6개 → `full(canBuy:true)`
    - 30칸에 30개 → `full(canBuy:false)`, 시트에 "칸 늘리기"가 없다
- [ ] **Step 2:** `flutter test test/data test/features/slot_gate_test.dart`를 실행해 실패하는지 확인한다.
- [ ] **Step 3:** 구현한다.
  - 모바일에서는 `path_provider`의 `getApplicationSupportDirectory()`를 쓴다.
  - 웹에서는 `InMemoryClickerRepository`를 유지한다.
  - 기존 `app_flow_test`를 5탭 구조에 맞게 고친다.
- [ ] **Step 4:** `flutter analyze && flutter test`를 실행해 통과하는지 확인한다.
- [ ] **Step 5: Commit** `feat(mobile): 5-tab shell, file-backed clicker storage, slot gate`

---

### Task 2: OS 내장 분리 · 얼굴 감지 · 첫 제작 동의

**Files:**
- Create: `pigeons/vision.dart`, `ios/Runner/VisionApi.swift`, `lib/platform/segmenter_ios.dart`, `lib/platform/segmenter_android.dart`, `lib/platform/face_detector.dart`(+`_ios`, `_android`, `_stub`), `lib/platform/segmenter_select.dart`, `lib/features/create/consent_sheet.dart`, `test/platform/segment_selection_test.dart`, `test/features/consent_sheet_test.dart`
- Modify: `lib/platform/segmenter.dart`, `lib/features/create/cutout_editor.dart`, `lib/core/model/clicker_spec.dart`(+`faceDetected`), `lib/core/model/clicker_pack.dart`, `ios/Runner/AppDelegate.swift`, `ios/Podfile`, `android/app/build.gradle`

**Interfaces:**
- Consumes: 기존 `RgbaImage`, `connectedAlphaRegion`, `erodeAlpha`, `decontaminateEdges`, `featherAlpha`, `cropToContent`
- Produces:
  - `Segmenter`를 확장한다:

    ```dart
    class SegmentResult {
      final RgbaImage cutout;              // 모든 사물을 합친 결과 (기존 의미)
      final List<RgbaImage> instances;     // 사물별 마스크를 적용한 결과. 비어 있을 수 있음(웹)
    }
    abstract class Segmenter {
      Future<SegmentResult> segment(Uint8List bytes, {void Function(double)? onProgress});
    }
    ```

    - 웹 구현은 `instances: []`이고, 탭 선택은 기존 `connectedAlphaRegion`을 쓴다.
    - 사물이 하나도 없으면 `NoSubjectFound` 예외를 던진다.
    - 지원하지 않는 기기면 `SegmentationUnsupported` 예외를 던진다.
  - `RgbaImage? selectInstanceAt(SegmentResult r, int x, int y)`: 탭 지점의 알파가 32 이상인 instance를 고른다. instances가 비어 있으면 `connectedAlphaRegion(r.cutout, x, y)`로 대신한다.
  - iOS(`VisionApi.swift`, Pigeon `@HostApi VisionHostApi`):
    - `segmentInstances(Uint8List png) -> List<Uint8List /*RGBA PNG per instance*/>`: `VNGenerateForegroundInstanceMaskRequest`를 쓰고, 인스턴스마다 `generateMaskedImage(ofInstances:from:croppedToInstancesExtent:false)`로 만든다.
    - `detectFaces(Uint8List png) -> int`: `VNDetectFaceRectanglesRequest`, 신뢰도 0.6 이상만 센다.
  - Android:
    - `SubjectSegmenter(options: enableMultipleSubjects(subjectResultOptions: enableSubjectBitmap))`
    - `FaceDetector(performanceMode: fast)`
  - `abstract class FaceDetector { Future<bool> containsFace(Uint8List png); }`
    - **분리된 최종 클릭커 이미지**에 대해 호출한다. 얼굴의 짧은 변이 이미지 짧은 변의 15% 이상일 때만 true로 본다.
  - 첫 제작 동의 `ConsentSheet`: `shared_preferences` 키 `consent.firstCreate.v1`이 없을 때만, 사진 선택 전에 한 번 띄운다. 문구는 고정이다.
    1. "친구나 다른 사람 얼굴로 만들지 않아요"
    2. "남이 만든 그림이나 캐릭터를 내 것처럼 올리지 않아요"
    3. "문제가 있으면 신고로 내려갈 수 있어요"
    - 버튼은 "약속할게요"
  - `ClickerSpec.faceDetected: bool`(기본 false). JSON 키는 `faceDetected`.

- [ ] **Step 1: 테스트 작성**
  - `segment_selection_test.dart`
    - instance 2개(왼쪽·오른쪽 사각형)에서 오른쪽을 탭하면 오른쪽 instance
    - 투명 지점을 탭하면 null
    - instances가 비면 cutout에서 연결 영역
  - `consent_sheet_test.dart`: 처음에는 뜨고, "약속할게요" 후 재진입하면 뜨지 않는다.
  - `clicker_pack_test`에 `faceDetected` 왕복을 추가한다.
- [ ] **Step 2:** 실행해서 실패하는지 확인한다.
- [ ] **Step 3:** Pigeon 정의 → `dart run pigeon --input pigeons/vision.dart`로 코드를 생성한다. Swift와 Android 구현, `segmenter_select.dart`(플랫폼별 구현 선택)을 만든다.
- [ ] **Step 4:** `cutout_editor.dart`를 고친다.
  - `NoSubjectFound`면 "물체를 찾지 못했어요. 다른 사진으로 해볼까요?"와 [다른 사진]을 보여준다.
  - `SegmentationUnsupported`면 "이 기기에서는 아직 만들기가 안 돼요"를 보여주고 홈으로 돌아간다.
  - 완료 시 `containsFace` 결과를 spec에 저장한다. true면 안내 배너 "사람 얼굴이 보여요. 나만 보고 놀 때만 써 주세요."를 띄운다(저장은 허용, 설계 §6.9).
- [ ] **Step 5:** `flutter analyze && flutter test`를 실행해 통과하는지 확인한다. `flutter build ios --no-codesign --simulator`와 `flutter build apk --debug`도 성공해야 한다. Xcode나 Android SDK가 없어서 빌드할 수 없으면 그 사실을 보고하고 Task 6에서 검증한다.
- [ ] **Step 6: Commit** `feat(mobile): on-device instance segmentation, face flag, first-create consent`

---

### Task 3: 스위치 카탈로그 · 이펙트 엔진 · 사운드 · 장착

**Files:**
- Create: `lib/core/switches/switch_catalog.dart`, `lib/core/switches/equip.dart`, `lib/core/feel/effect_stack.dart`, `lib/platform/sfx_soloud.dart`, `lib/widgets/aura_layer.dart`, `lib/features/equip/equip_sheet.dart`, `test/core/switches/switch_catalog_test.dart`, `test/core/feel/effect_stack_test.dart`, `test/widgets/clicker_stage_spin_test.dart`
- Modify: `lib/core/model/settings.dart`(장착을 `Equip`으로 대체하되 `ClickerPack` JSON 하위 호환 유지), `lib/core/feel/feel_planner.dart`, `lib/widgets/clicker_stage.dart`, `lib/widgets/particles.dart`, `lib/platform/sfx.dart`, `lib/features/create/tune_panel.dart`

**Interfaces:**
- Consumes: `FeelPlanner.plan`, `ClickerStage`, `SfxPlayer`
- Produces:
  - `enum SwitchKind { sound, effect }`, `enum Grade { common, rare, epic, legend }`
  - `class SwitchDef { final String id; final SwitchKind kind; final Grade grade; final String name; }`
  - `const switchCatalog: List<SwitchDef>`: Global Constraints의 13개. 한국어 이름은 `clicky` "찰칵", `tactile` "톡", `thock` "도각", `pop` "뽁", `coin` "띠링", `boing` "보잉", `laser` "레이저", `press_basic` "꾹", `sparks` "스파크", `stars` "별가루", `shards` "파편", `spin90` "빙글", `aura` "오라"
  - `class Equip { final String sound; final String effect; }`: 기본값 `Equip('clicky','press_basic')`. `ClickerSpec.defaultEquip`에 저장하고 JSON 키는 `defaultEquip`. 기존 POC JSON(`sound`/`feel` 필드)을 읽으면 가장 가까운 id로 바꾼다.
  - `EffectStack.of(String effectId) → EffectProfile`
    - `EffectProfile { double pressDepthScale; double rotationPerTapDeg; ParticleTheme? burst; bool ambient; int burstBase; }`
    - 값:
      - `press_basic`: (1.0, 0, none, false, 0)
      - `sparks`: (1.0, 0, sparks, false, 7)
      - `stars`: (1.0, 0, stars, false, 9)
      - `shards`: (1.0, 0, shards, false, 9)
      - `spin90`: (0.8, 90, sparks, false, 6)
      - `aura`: (1.0, 0, stars, true, 8)
    - v1은 이펙트 1칸이라 스택은 1개다. 계획 이후 여러 칸이 생기면 합성할 자리로 `EffectStack.combine(List<String>)`도 만든다. 회전은 합하고, 파티클 수는 합하되 상한 24를 적용한다.
  - `FeelPlan`에 `rotationDeg`(이번 탭 후 목표 누적 각도)를 추가한다. 렌더할 때는 `rotation % 360`으로 쓰고, 애니메이션은 최단 경로가 아니라 **누적 방향**으로 돌린다.
  - `aura`: `AuraLayer`가 클릭커 뒤를 공전하는 파티클 12개를 상시로 그린다. 단계가 오를수록 속도 ×1.0/1.3/1.6/2.0. 모션을 끄면 숨긴다.
  - 사운드 `SoloudSfxPlayer implements SfxPlayer`
    - 에셋 없이 `flutter_soloud`의 파형 생성(waveform)으로 합성한다. 쓰기 전에 API를 확인한다.
    - 레시피(id → 파형·주파수·길이·엔벨로프):
      - `clicky` noise 4kHz HP 18ms
      - `tactile` noise 1.2kHz LP 25ms
      - `thock` sine 140Hz 60ms
      - `pop` sine 600→200Hz 40ms
      - `coin` square 988→1319Hz 120ms
      - `boing` sine 220Hz + 6Hz 비브라토 220ms
      - `laser` saw 1800→200Hz 160ms
    - 단계가 오를 때마다 +2반음(POC 규칙). 동시 보이스는 최대 8이고, 넘치면 가장 오래된 소리를 멈춘다.
    - 웹은 기존 WebAudio 구현에 새 id를 추가한다.
  - 햅틱: 단계별로 calm `selectionClick`, charged `lightImpact`, wild `mediumImpact`, frenzy `heavyImpact`
  - `EquipSheet(item, ownedSwitches)`: 사운드와 이펙트 탭에 보유 스위치를 등급 색 테두리로 보여주고, 미보유 스위치는 잠금으로 보여준다. 고르면 상단 `ClickerStage` 미리보기에 바로 반영한다.
    - 만들기 4단계(튜닝 패널)는 이 시트로 교체한다.
    - "나 > 보관함"에서 클릭커를 길게 누르면 이 시트를 연다.

- [ ] **Step 1: 테스트 작성**
  - `switch_catalog_test`: id 13개가 Global Constraints 목록과 정확히 같고, kind와 grade가 일치한다. 기본 보유는 `clicky`, `press_basic`.
  - `effect_stack_test`
    - `spin90.rotationPerTapDeg == 90`
    - `combine(['sparks','stars','shards'])` 파티클 25 → 24
    - `aura.ambient == true`
  - `feel_planner_test`에 추가
    - 모션 끄기 → rotation 0, ambient false
    - spin90으로 탭 3번 → 누적 목표 270
  - `clicker_stage_spin_test`
    - spin90 장착 후 pointer down 4회 → 최종 Transform 회전이 360°(=0°)이고 중간에 역회전이 없다(프레임별 각도가 단조 증가)
    - 10개 포인터 동시 down → 예외 없음, 파티클 ≤ 24
  - 기존 POC JSON(`sound: clicky`, `feel.particles: stars`)을 읽으면 `Equip('clicky','stars')`
- [ ] **Step 2:** 실행해서 실패하는지 확인한다.
- [ ] **Step 3:** 구현한다.
- [ ] **Step 4:** `flutter analyze && flutter test`를 실행해 통과하는지 확인한다.
- [ ] **Step 5: Commit** `feat(mobile): switch catalog, effect engine (spin90, aura), soloud sfx, equip sheet`

---

### Task 4: 로컬 게임 백엔드 (퀘스트 · 조각 · 뽑기 · 기록)

**Files:**
- Create: `lib/core/game/game_backend.dart`, `lib/core/game/kst.dart`, `lib/core/game/quest_pool.dart`, `lib/core/game/gacha_math.dart`, `lib/data/local_game_backend.dart`, `test/core/game/kst_test.dart`, `test/core/game/gacha_math_test.dart`, `test/data/local_game_backend_test.dart`
- Modify: `lib/data/app_scope.dart`, `lib/data/app_records.dart`(GameBackend 기록으로 이전), `lib/features/play/play_page.dart`(플레이 종료/이탈 시 기록 전송)

**Interfaces:**
- Consumes: 기존 `Clock`, `RecordStore` 개념, `switchCatalog`
- Produces:

  ```dart
  abstract class GameBackend {
    Future<List<QuestView>> todayQuests();
    Future<int> claimQuest(String key);                  // 새 조각 수. 예외: AlreadyClaimed, QuestIncomplete
    Future<int> shards();
    Future<PullResult> pull(String requestId);          // 예외: NotEnoughShards
    GachaRates rates();
    Future<Set<String>> ownedSwitches();
    Future<void> recordPlay(PlayReport report);          // 퀘스트 진행도 갱신 포함. 규칙 위반이면 PlayRejected
    Future<ClickerStatView> statOf(String clickerId);
    Stream<void> get changes;
  }
  class QuestView { String key, title; int target, progress, reward; bool claimed; }
  class PullResult { SwitchDef sw; bool duplicate; int refund; int shards; int pityCounter; }
  class PlayReport { String clickerId; bool ownClicker; PlayMode mode; int score, maxCombo, taps, durationMs; }
  ```

  - `kstDay(DateTime utc) → String`. 서버 계획 Task 5와 같은 경계를 쓴다.
  - `pickGrade(double r, int pity) → Grade`, `pickSwitch(Grade g, double r2) → SwitchDef`. 서버 계획 Task 7과 같은 구간을 쓴다.
  - `LocalGameBackend(SharedPreferences prefs, Clock clock, Random random)`
    - 상태는 JSON 하나(`game.v1`)에 담고, 갱신할 때마다 통째로 저장한다.
    - 같은 `requestId`로 pull을 다시 하면 저장된 결과를 돌려준다.
    - `friend_play` 퀘스트는 `ownClicker == false`일 때만 센다. 샘플 클릭커도 "남이 만든 것"으로 친다.
    - `redeem_1` 퀘스트는 서버 연결 전에는 **풀에서 제외**하고 뽑지 않는다(체험판에서 완료할 수 없으므로).
  - 플레이 검증은 서버 규칙과 같다: 탭/초 ≤ 25, `maxCombo ≤ taps`, 10초 모드 `durationMs ≤ 10500`.

- [ ] **Step 1: 테스트 작성**
  - `kst_test`, `gacha_math_test`: 서버 계획 Task 5·7 Step 1과 같은 값
  - `local_game_backend_test`(FakeClock, 고정 Random, `SharedPreferences.setMockInitialValues`)
    - 같은 날 퀘스트 4개가 고정, `redeem_1`은 나오지 않는다
    - KST 자정이 지나면 새 목록
    - 연타 기록 → `taps_1000` 진행 → claim → 조각 +1 → 다시 claim하면 `AlreadyClaimed`
    - 조각 4개로 pull하면 `NotEnoughShards`
    - 같은 requestId로 pull 2회 → 같은 결과, 차감 1회
    - pity 19에서 r=0.0이면 epic 이상
    - 중복이면 환급
    - 앱 재시작(새 인스턴스) 후에도 상태가 유지된다
- [ ] **Step 2:** 실행해서 실패하는지 확인한다.
- [ ] **Step 3:** 구현한다.
- [ ] **Step 4:** `flutter analyze && flutter test`를 실행해 통과하는지 확인한다.
- [ ] **Step 5: Commit** `feat(mobile): GameBackend with local quests, shards, gacha, play records`

---

### Task 5: 홈 · 뽑기 연출 · 나 · 랭킹 화면

**Files:**
- Create: `lib/features/home/quest_card.dart`, `lib/features/gacha/gacha_page.dart`, `lib/features/gacha/reveal_animation.dart`, `lib/features/gacha/rates_sheet.dart`, `lib/features/me/collection_page.dart`, `test/features/home_quests_test.dart`, `test/features/gacha_page_test.dart`
- Modify: `lib/features/home/home_page.dart`, `lib/features/me/me_page.dart`, `lib/features/ranking/ranking_page.dart`, `lib/app_shell.dart`(앱이 활성화될 때 `GameBackend.changes`를 새로고침)

**Interfaces:**
- Consumes: `GameBackend`, `switchCatalog`, `EquipSheet`, `ClickerStage`
- Produces (승인된 목업 `return-loop.html`의 ③홈, ②랭킹 레이아웃):
  - **홈**
    - "오늘의 퀘스트 n/4" 카드: 진행 바, 완료하면 [받기] 버튼 → 조각 +n 토스트
    - 뽑기 카드: "조각 a/5 · 다음 뽑기까지 b개", 5개 이상이면 [뽑기] → `GachaPage`
    - "내 작품 소식"은 체험판에서 내 클릭커별 최고 기록 카드로 대신한다. 친구 소식은 계획 3에서 붙인다.
  - **GachaPage**
    - 뽑기 버튼 → 캡슐이 흔들린다(등급과 무관하게 0.8초) → 등급 색 빛 → 스위치 공개
    - epic 이상이면 화면 플래시와 `heavyImpact`
    - 공개 화면에서 **그 스위치를 장착한 샘플 클릭커를 바로 눌러볼 수 있다**(ClickerStage 재사용). [내 클릭커에 끼우기] → 보관함 선택 → `EquipSheet`
    - 중복이면 "이미 있어요 · 조각 +n 돌려받았어요"
    - [확률 보기] → `RatesSheet`: 등급 확률, 등급별 목록, "20번 안에 에픽 이상 확정"
    - 버튼을 연타해도 요청은 하나만 보낸다. requestId는 버튼을 누를 때 생성하고, 진행 중이면 버튼을 비활성화한다.
  - **나**: 보관함 그리드(사용 칸/전체 칸), 스위치 컬렉션(13칸, 미보유는 실루엣), 설정(모션, 사운드, 흔들림)
  - **랭킹**: "친구를 추가하면 여기서 겨룰 수 있어요"(계획 3)와 내 클릭커별 기록(최고 콤보, 총 클릭) 목록
  - **탐색**: "곧 열려요" 화면에 샘플 클릭커 1개를 눌러볼 수 있게 둔다

- [ ] **Step 1: 위젯 테스트 작성**
  - `home_quests_test`(가짜 GameBackend)
    - 완료 퀘스트의 [받기]를 누르면 `claimQuest`가 1회 호출되고 버튼이 "받음"으로 바뀐다
    - 조각 7이면 "조각 7/5"가 아니라 "뽑기 1회 가능"을 표시한다
  - `gacha_page_test`
    - [뽑기]를 3번 빠르게 탭해도 `pull` 호출은 1회
    - 결과가 epic이면 등급 라벨 "에픽"
    - 중복이면 환급 문구
    - [확률 보기]의 확률 합이 100%
- [ ] **Step 2:** 실행해서 실패하는지 확인한다.
- [ ] **Step 3:** 구현한다.
- [ ] **Step 4:** `flutter analyze && flutter test`를 실행해 통과하는지 확인한다.
- [ ] **Step 5: Commit** `feat(mobile): home quests, gacha reveal, collection, ranking placeholder`

---

### Task 6: 실기기 검증

**Files:**
- Create: `docs/qa/2026-v1-app-playable-checklist.md`(결과 기록)

- [ ] **Step 1:** iOS 시뮬레이터(iOS 17 이상) 또는 실기기와 Android 에뮬레이터(Play 서비스 이미지) 또는 실기기에서 `flutter run`을 실행한다. 둘 중 가능한 플랫폼에서 모두 확인한다.
- [ ] **Step 2: 체크리스트**(각 항목에 통과 여부와 스크린샷 기록)
  1. 첫 제작 시 동의 시트 → 약속 → 이후 안 뜸
  2. 샘플 강아지 4마리 사진 → 인스턴스 분리 → 한 마리 탭 → 그 강아지만 남음
  3. 하늘 사진 → "물체를 찾지 못했어요"
  4. 사람 얼굴 사진 → 얼굴 안내 배너, `faceDetected:true`로 저장
  5. 7번째 저장 시 보관함 시트 → 지우고 만들기
  6. 앱을 강제 종료한 뒤 다시 열어도 보관함, 장착, 조각, 퀘스트가 유지됨
  7. `spin90`을 장착하고 연타 → 계속 한 방향으로 회전. 프레임 드롭 체감 없음(Flutter DevTools 성능 오버레이 60fps 확인)
  8. `aura` + 10개 손가락 연타 → 끊김 없음
  9. 퀘스트 완료 → 받기 → 뽑기 → 연출 → 바로 눌러보기 → 내 클릭커에 끼우기
  10. 모션 끄기 → 회전, 오라, 파티클, 흔들림 모두 사라짐
  11. 사운드 7종이 모두 구분돼서 들림. 햅틱 단계 차이 체감(실기기만)
- [ ] **Step 3:** 실패한 항목은 해당 Task로 돌아가 고친다(테스트 먼저 추가).
- [ ] **Step 4: Commit** `docs(qa): v1 playable device checklist results`

---

## 이 계획에서 하지 않는 것
- 친구 공유(QR·코드·링크), 친구 랭킹, 내 작품 소식, 업로드, 신고 → **계획 3** (서버 연동)
- 보관함 칸 결제 → **계획 3**
- Firebase 로그인, `RemoteGameBackend` → **계획 3**
- 탐색(쇼츠)·마켓 → v1.5
