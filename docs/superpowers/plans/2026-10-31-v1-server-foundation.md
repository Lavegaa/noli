# v1 서버 기반 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** v1 "친구랑" 체크포인트가 쓰는 API 서버를 만든다. 범위는 게스트 계정, 클릭커 업로드, 보관함 칸, 공유 코드, 친구, 플레이 기록·랭킹·소식, 일일 퀘스트, 조각 뽑기, 장착, 신고·차단, 보관함 칸 구매(테스트 결제)다.

**Architecture:**
- `apps/server`에 NestJS 모노리스를 두고, 도메인마다 모듈 1개를 만든다.
- 외부 서비스는 전부 인터페이스(DI 토큰) 뒤에 둔다. 해당 서비스: Firebase 인증, 객체 저장소, 이미지 검사, 결제 검증, 푸시, 시계, 난수.
- e2e 테스트에서는 이 인터페이스에 가짜 구현을 주입한다. DB는 Docker로 띄운 실제 PostgreSQL을 쓴다.
- 권한 판단은 `CapabilityGuard` 한 곳에서만 한다.

**Tech Stack:** Node 24, pnpm, NestJS 12, TypeScript, Prisma 7.10(`@prisma/adapter-pg` 드라이버 어댑터), PostgreSQL 17(docker compose), firebase-admin 14, Nest CLI 기본 테스트 러너, supertest.

**Spec:** `docs/product/2026-10-31-clicker-product-design.md` (§4 용어, §6 기능, §6.10 계정, §7 v1 범위, §8 기술). 손맛·클릭커 포맷은 `docs/design/2026-10-31-poc-design.md`와 `apps/mobile/lib/core/model/`을 따른다.

## Global Constraints

- 위치: `apps/server`. 패키지 매니저는 pnpm. 루트에 `docker-compose.yml`(db: 5432, db-test: 5433)을 둔다.
- 라이브러리 API는 추측하지 않는다. Prisma 7(`prisma.config.ts`, 드라이버 어댑터, 생성 클라이언트 경로)과 NestJS 12는 **Context7로 현재 문서를 확인한 뒤** 쓴다.
- 시간은 DB에 UTC로 저장한다. **하루는 Asia/Seoul 00:00에 시작하고, 주는 월요일 00:00 KST에 시작한다.** 계산은 반드시 `Clock`을 거친다.
- **동의 전 최소 수집**: `Account`에는 이름·이메일·전화·광고 ID 컬럼을 두지 않는다. 사진(클릭커 이미지)은 공유 코드를 만들 때만 업로드된다.
- 에러 응답 형식은 `{"error":{"code":"SLOT_FULL","message":"..."}}`로 통일하고, 적절한 HTTP 상태를 쓴다. 코드는 `UPPER_SNAKE`.
- 인증 헤더는 `Authorization: Bearer <Firebase ID token>`. `/health`와 `GET /gacha/rates` 외 모든 경로에 인증이 필요하다.
- 수치 [베타 초기값, `src/config/game.config.ts` 한 파일에 상수로 모은다]:
  - 기본 보관함 칸 6, 최대 30. 상품 `slots_3`은 +3칸
  - 공유 코드 6자, 문자 집합 `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, 유효기간 7일
  - 플레이 검증: 탭/초 ≤ 25, `maxCombo ≤ taps`, `durationMs ≥ 1`, 10초 모드 `durationMs ≤ 10500`
  - 뽑기 1회 = 조각 5
  - 확률: common 70 / rare 22 / epic 7 / legend 1
  - 중복 환급 조각: common 1 / rare 2 / epic 3 / legend 5
  - 천장: 직전 epic 이상 이후 20번째 뽑기는 epic 이상 확정
  - 일일 퀘스트 4개, 보상 조각 1~2
  - 신고 3건 누적 시 제작자 업로드 제한(반복 침해자)

## Review Focus

1. **중복 요청**: 같은 퀘스트 보상 수령, 같은 결제 transactionId 검증, 같은 코드 재수령, 뽑기 연타가 두 번 반영되면 안 된다. 멱등이거나 409로 처리한다. → Task 6, 9, 4, 7에 테스트를 둔다.
2. **숨겨진 클릭커**: 신고로 숨겨진 클릭커의 코드 수령, 조회, 플레이 기록이 모두 거부되고 받은 사람 보관함에서도 안 보여야 한다. → Task 8.
3. **보관함 칸 가득 참**: 만들기나 수령 시 `409 SLOT_FULL`을 반환하고 아무것도 추가하지 않는다. 지우면 칸이 바로 비어야 한다. → Task 3, 4.
4. **KST 경계**: UTC 15:00(=KST 00:00) 직후에 퀘스트가 새 날로 바뀌고, 주간 랭킹은 월요일 KST 기준으로 리셋돼야 한다. → Task 5, 6.
5. **권한 없는 호출**: 게스트가 공유, 친구, 결제를 호출하면 `403 CAPABILITY_REQUIRED`와 이유를 받는다. 나를 차단한 사람의 코드는 수령할 수 없다. → Task 2, 4, 8.

## 데이터 모델 (Prisma, 모든 Task가 공유)

| 모델 | 핵심 필드 | Task |
|---|---|---|
| `Account` | `id`(uuid), `firebaseUid` unique, `linkedProviders` string[], `birthDate?`, `consentStatus` enum(`not_required`,`pending`,`granted`), `storageSlots` int=6, `shards` int=0, `pityCounter` int=0, `uploadRestricted` bool, `createdAt` | 2 |
| `Clicker` | `id`, `creatorId`, `name`, `version` int, `idleKey`, `pressedKey?`, `specJson` Json(ClickerSpec v1 + 기본 장착), `faceDetected` bool, `hidden` bool, `deletedByCreator` bool, `createdAt`, `updatedAt` | 3 |
| `InventoryItem` | `id`, `accountId`, `clickerId`, `source` enum(`created`,`received`,`original`), `receivedVersion?`, `soundSwitchId?`, `effectSwitchId?`, unique(`accountId`,`clickerId`) | 3, 7 |
| `ShareCode` | `code` pk, `clickerId`, `creatorId`, `allowFriend` bool, `expiresAt` | 4 |
| `Friendship` | `accountA`, `accountB`(정렬 저장 a<b), `createdAt`, unique(a,b) | 4 |
| `PlayRecord` | `id`, `accountId`, `clickerId`, `mode` enum(`free`,`timed10`), `score`, `maxCombo`, `taps`, `durationMs`, `playedAt` | 5 |
| `ClickerStat` | `accountId`, `clickerId`, `bestScore`, `bestCombo`, `totalTaps`, pk(account,clicker) | 5 |
| `NewsItem` | `id`, `recipientId`, `type` enum(`friend_record`,`received`), `payload` Json, `createdAt`, `readAt?` | 5 |
| `DailyQuest` | `accountId`, `day` (KST `YYYY-MM-DD`), `questKey`, `target`, `progress`, `reward`, `claimedAt?`, pk(account,day,questKey) | 6 |
| `Switch` | `id`(slug), `kind` enum(`sound`,`effect`), `grade` enum(`common`,`rare`,`epic`,`legend`), `name`, `assetJson` Json | 7 |
| `OwnedSwitch` | `accountId`, `switchId`, `acquiredAt`, pk(account,switch) | 7 |
| `GachaPull` | `id`, `accountId`, `switchId`, `duplicate` bool, `refund` int, `requestId` unique, `createdAt` | 7 |
| `Report` | `id`, `reporterId`, `clickerId`, `reason` enum(`face`,`copyright`,`inappropriate`,`other`), `note?`, `status` enum(`pending`,`restored`,`removed`), `createdAt` | 8 |
| `Block` | `blockerId`, `blockedId`, pk | 8 |
| `Purchase` | `transactionId` pk, `accountId`, `platform` enum(`ios`,`android`), `productId`, `createdAt` | 9 |

`specJson`은 모바일 `ClickerPack.toJson()`의 `spec` 부분에 `defaultEquip: {sound, effect}`를 더한 형태다. 서버는 `name`과 `defaultEquip`만 해석하고, 나머지는 그대로 저장하고 돌려준다.

---

### Task 1: 서버 스캐폴드 · DB · 테스트 하네스

**Files:**
- Create: `docker-compose.yml`(루트), `apps/server/`(Nest CLI 생성물), `apps/server/prisma/schema.prisma`, `apps/server/prisma.config.ts`, `src/prisma/prisma.service.ts`, `src/common/app-error.ts`, `src/common/error.filter.ts`, `src/common/ports.ts`, `src/health/health.controller.ts`, `src/config/game.config.ts`, `test/helpers/test-app.ts`, `test/health.e2e-spec.ts`, `.env.example`

**Interfaces:**
- Produces:
  - `class AppError extends HttpException { constructor(status: number, code: string, message: string) }`
  - `ErrorFilter`: 모든 예외를 공통 에러 형식으로 바꾼다. 처리 안 된 예외는 `500 INTERNAL`.
  - `src/common/ports.ts`의 DI 토큰과 인터페이스:
    - `CLOCK: Clock { now(): Date }`
    - `RANDOM: Random { next(): number /*[0,1)*/ }`
    - `AUTH_VERIFIER: AuthVerifier { verify(idToken: string): Promise<{ uid: string; providers: string[] }> }`
    - `OBJECT_STORAGE: ObjectStorage { put(key: string, bytes: Buffer, contentType: string): Promise<void>; url(key: string): string }`
    - `IMAGE_SCANNER: ImageScanner { scan(bytes: Buffer): Promise<{ adult: boolean; violence: boolean }> }`
    - `PURCHASE_VERIFIER: PurchaseVerifier { verify(platform: 'ios'|'android', productId: string, receipt: string): Promise<{ valid: boolean; transactionId: string }> }`
    - `NOTIFIER: Notifier { notify(accountId: string, title: string, body: string): Promise<void> }`
  - 실제 구현: `SystemClock`, `MathRandom`, `FirebaseAuthVerifier`, `S3ObjectStorage`(S3 호환, env로 endpoint 설정), `NoopImageScanner`(v1 기본, 실제 Vision 연동은 계획 4), `RejectingPurchaseVerifier`(계획 3에서 교체), `FcmNotifier`
  - `test/helpers/test-app.ts`의 `createTestApp(overrides?): Promise<{ app; fakes: { clock: FakeClock; random: SeqRandom; auth: FakeAuth; storage: MemoryStorage; scanner: FakeScanner; purchases: FakePurchases; notifier: RecordingNotifier } }>`
    - `FakeAuth`는 토큰 문자열 `"uid:<uid>:<providers,comma>"`를 해석한다. 예: `"uid:kid1:anonymous"`, `"uid:kid2:google.com"`
    - `resetDb()`는 테스트 DB의 모든 테이블을 TRUNCATE한다.

- [ ] **Step 1:** `pnpm dlx @nestjs/cli new server --package-manager pnpm --skip-git`을 `apps/`에서 실행한다. 루트 `docker-compose.yml`에 `postgres:17`을 두 개(db 5432, db-test 5433, tmpfs) 정의하고 `docker compose up -d`로 띄운다.
- [ ] **Step 2:** Prisma 7을 설치한다(`prisma`, `@prisma/client`, `@prisma/adapter-pg`, `pg`). Context7 문서대로 `prisma.config.ts`와 어댑터 기반 `PrismaService`를 만든다. 스키마는 이 Task에서 빈 모델 없이 datasource와 generator만 둔다(모델은 각 Task가 추가).
- [ ] **Step 3: 실패하는 테스트 작성** `test/health.e2e-spec.ts`
  - `GET /health` → 200 `{ "status": "ok" }`
  - 없는 경로 → 404 `{ "error": { "code": "NOT_FOUND" } }`
- [ ] **Step 4:** `pnpm test:e2e`를 실행해 실패하는지 확인한다.
- [ ] **Step 5:** 다음을 구현한다.
  - `HealthController`
  - `ErrorFilter` 전역 등록. Nest의 `NotFoundException`은 `NOT_FOUND`로, `BadRequestException`/ValidationPipe 오류는 `VALIDATION_FAILED`로 변환한다.
  - 전역 `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`
  - `ports.ts`와 실제 구현, `test-app.ts`. e2e는 `DATABASE_URL`을 5433으로 덮어쓴다. `migrate reset --force`는 test 스크립트의 사전 단계(`pretest:e2e`)에서 실행한다.
- [ ] **Step 6:** `pnpm test:e2e`를 실행해 통과하는지 확인한다. `pnpm lint`와 `pnpm build`도 통과해야 한다.
- [ ] **Step 7: Commit** `feat(server): scaffold NestJS + Prisma + e2e harness`

---

### Task 2: 인증 · 계정 · 권한 게이트

**Files:**
- Create: `src/auth/firebase-auth.guard.ts`, `src/auth/current-account.decorator.ts`, `src/accounts/accounts.module.ts`, `accounts.service.ts`, `accounts.controller.ts`, `src/auth/capability.ts`, `src/auth/capability.guard.ts`, `test/accounts.e2e-spec.ts`
- Modify: `prisma/schema.prisma` (+`Account`)

**Interfaces:**
- Consumes: `AUTH_VERIFIER`, `CLOCK`, `AppError`
- Produces:
  - 전역 `FirebaseAuthGuard`: 토큰을 검증하고, `firebaseUid` 기준으로 `Account`를 upsert한다. `linkedProviders`는 `anonymous`를 뺀 provider 목록이다. 결과는 `req.account`에 넣는다. `@Public()` 데코레이터로 제외할 수 있다.
  - `@CurrentAccount() account: Account`
  - `type Capability = 'share' | 'addFriend' | 'purchase' | 'publishMarket'`
  - `@RequireCapability(cap: Capability)`와 `CapabilityGuard`
  - `capabilitiesOf(account: Account, now: Date): Record<Capability, { allowed: boolean; reason?: 'LINK_REQUIRED' | 'BIRTHDATE_REQUIRED' | 'CONSENT_REQUIRED' | 'UPLOAD_RESTRICTED' }>` (순수 함수, `capability.ts`)
  - `GET /me` → `{ id, linked: boolean, storageSlots, usedSlots, shards, capabilities }`
  - `PUT /me/birthdate { birthDate: 'YYYY-MM-DD' }` → 만 나이가 14 미만이면 `consentStatus='pending'`, 아니면 `'not_required'`

**규칙** (설계 §6.10):
1. 연동 수단이 없으면 모든 권한은 `LINK_REQUIRED`다.
2. 연동은 됐지만 `birthDate`가 없으면 `BIRTHDATE_REQUIRED`다.
3. 14세 미만이고 `consentStatus !== 'granted'`이면 `CONSENT_REQUIRED`다.
4. `publishMarket`은 `uploadRestricted`이면 `UPLOAD_RESTRICTED`다. v1에는 마켓이 없지만 게이트는 미리 둔다.
5. 위에 해당하지 않으면 허용한다.

거부 응답은 `403 CAPABILITY_REQUIRED`이고, message에 reason을 담는다.

- [ ] **Step 1: 단위 테스트** `src/auth/capability.spec.ts`
  - `anonymous only → share.allowed=false, reason LINK_REQUIRED`
  - `google linked, no birthDate → BIRTHDATE_REQUIRED`
  - `birthDate 2016-05-01, now 2026-10-31, consent pending → CONSENT_REQUIRED`
  - `birthDate 2012-10-31, now 2026-10-31 → allowed` (만 14세가 되는 생일 당일은 허용)
  - `uploadRestricted → publishMarket UPLOAD_RESTRICTED, share allowed`
- [ ] **Step 2: e2e 테스트** `test/accounts.e2e-spec.ts`
  - 토큰이 없으면 401 `UNAUTHENTICATED`
  - 같은 uid로 두 번 호출해도 `GET /me` id가 같다(upsert)
  - 처음에는 `storageSlots 6`, `shards 0`
  - `uid:kid1:anonymous`로 `@RequireCapability('share')` 테스트 엔드포인트를 호출하면 403 `CAPABILITY_REQUIRED`
  - anonymous로 시작한 같은 uid가 나중에 `google.com` 연동으로 들어오면 같은 계정이고 `linked:true`
- [ ] **Step 3:** 실행해서 실패하는지 확인한다.
- [ ] **Step 4:** 구현한다. 테스트용 엔드포인트는 테스트 모듈에서만 등록한다.
- [ ] **Step 5:** 실행해서 통과하는지 확인한다.
- [ ] **Step 6: Commit** `feat(server): guest accounts, firebase guard, capability gate`

---

### Task 3: 클릭커 업로드 · 보관함 칸

**Files:**
- Create: `src/clickers/clickers.module.ts`, `clickers.service.ts`, `clickers.controller.ts`, `src/inventory/inventory.module.ts`, `inventory.service.ts`, `inventory.controller.ts`, `test/clickers.e2e-spec.ts`
- Modify: `schema.prisma` (+`Clicker`, `InventoryItem`)

**Interfaces:**
- Consumes: `OBJECT_STORAGE`, `@CurrentAccount`
- Produces:
  - `POST /clickers`: multipart로 `idle`(png, 필수, ≤ 2MB)와 `pressed`(png, 선택)를 받고, `spec`(JSON 문자열, `name` 1~20자 필수)과 `faceDetected`(bool)도 받는다.
    - 성공하면 `201 { clickerId, inventoryItemId }`
    - 저장 키는 `clickers/<id>/v<version>/idle.png`
    - 클릭커 생성과 `source='created'` 보관함 항목 생성은 **한 트랜잭션**으로 처리한다.
  - `PUT /clickers/:id`: 같은 형식이고 제작자만 호출할 수 있다. `version`을 +1한다.
  - `DELETE /clickers/:id`: 제작자만 호출할 수 있다. `deletedByCreator=true`로 표시하고 제작자 보관함에서 뺀다. 받은 사람의 보관함은 유지한다.
  - `GET /clickers/:id` → `{ id, name, version, creator: { id }, idleUrl, pressedUrl?, spec, faceDetected }`
    - `hidden`이면 404 `CLICKER_UNAVAILABLE`
  - `ClickersService.getVisible(id): Promise<Clicker>`: Task 4, 5, 8이 쓴다. hidden이면 `AppError(404,'CLICKER_UNAVAILABLE')`를 던진다.
  - `InventoryService.assertFreeSlot(accountId, tx?)`: 칸이 가득 차면 `AppError(409,'SLOT_FULL')`
  - `InventoryService.add(accountId, clickerId, source, receivedVersion?, tx?)`
  - `GET /inventory` → `{ storageSlots, items: [{ id, source, clicker: <GET 형식>, equip: { sound, effect } }] }`. hidden 클릭커는 제외한다.
  - `DELETE /inventory/:itemId`

> 업로드는 v1 앱에서 **공유 직전**에만 일어난다(설계 §6.1-4, §6.10 최소 수집). 공유하지 않은 클릭커는 기기에만 있다. 그래서 서버 보관함 칸은 "서버에 있는 것"만 센다. 기기 쪽 칸 계산과 합치는 일은 앱 계획(2)에서 `usedSlots` 동기화로 처리한다.

- [ ] **Step 1: e2e 테스트**
  - 업로드 → GET 응답의 `idleUrl`이 `MemoryStorage`에 있다.
  - 이름 21자면 400 `VALIDATION_FAILED`
  - png가 아니면 400 `INVALID_IMAGE`
  - 보관함 6개가 차 있으면 7번째 업로드는 409 `SLOT_FULL`이고 Clicker 행이 생기지 않는다.
  - 하나를 지우면 다시 업로드할 수 있다.
  - 남이 PUT/DELETE하면 403 `NOT_OWNER`
  - PUT하면 version 2가 되고 키가 `v2`
- [ ] **Step 2:** 실행해서 실패하는지 확인한다.
- [ ] **Step 3:** 구현한다. png 판별은 매직 바이트로 한다.
- [ ] **Step 4:** 실행해서 통과하는지 확인한다.
- [ ] **Step 5: Commit** `feat(server): clicker upload and storage slots`

---

### Task 4: 공유 코드 · 수령 · 친구

**Files:**
- Create: `src/share/share.module.ts`, `share.service.ts`, `share.controller.ts`, `src/friends/friends.module.ts`, `friends.service.ts`, `friends.controller.ts`, `test/share.e2e-spec.ts`
- Modify: `schema.prisma` (+`ShareCode`, `Friendship`)

**Interfaces:**
- Consumes: `ClickersService.getVisible`, `InventoryService.assertFreeSlot/add`, `IMAGE_SCANNER`, `OBJECT_STORAGE`, `RANDOM`, `CLOCK`, `capabilitiesOf`, `BlocksService.isBlocked(a,b)` (Task 8에서 만든다. 이 Task에서는 항상 false를 돌려주는 임시 구현을 `src/blocks/blocks.service.ts`에 두고 Task 8에서 채운다)
- Produces:
  - `POST /clickers/:id/share { allowFriend: boolean }`: `@RequireCapability('share')`, 제작자 또는 그 클릭커를 보관함에 가진 사람만 호출할 수 있다.
    - 저장된 idle/pressed를 스캔한다. `adult || violence`면 422 `CONTENT_REJECTED`를 반환하고 그 클릭커를 `hidden=true`로 바꾼다.
    - 통과하면 `201 { code, link: "https://<SHARE_HOST>/s/<code>", expiresAt, faceWarning: faceDetected }`
  - `GET /share/:code` → 미리보기 `{ clicker, creator: { id }, expired: bool }`. 게스트도 호출할 수 있다.
  - `POST /share/:code/redeem { addFriend: boolean }`. 게스트도 호출할 수 있다.
    - 코드가 없거나 만료되면 404 `CODE_INVALID`
    - 내 클릭커면 409 `OWN_CLICKER`
    - 이미 갖고 있으면 200(멱등)이고 `alreadyOwned:true`
    - 칸이 없으면 409 `SLOT_FULL`
    - 제작자와 차단 관계면 404 `CODE_INVALID`(존재를 드러내지 않는다)
    - 성공하면 보관함에 `source='received'`, `receivedVersion=clicker.version`으로 추가하고, 제작자에게 `NewsItem(type='received')`를 남긴다. NewsItem 모델은 Task 5에서 만든다. 이 Task에서는 `NewsService.add` 임시 구현을 두고 Task 5에서 채운다.
    - 친구 등록 조건: `addFriend && code.allowFriend && 양쪽 모두 addFriend 권한 허용`. 조건이 맞으면 `Friendship`을 upsert하고 `friendAdded:true`
    - 수령자에게 권한이 없으면 수령은 성공시키고 `friendAdded:false, friendBlockedReason:<reason>`을 돌려준다(설계: 받기는 게스트도 가능, 친구는 권한 필요).
  - `GET /friends` → `[{ id, since }]`
  - `DELETE /friends/:id`
  - `FriendsService.friendIdsOf(accountId): Promise<string[]>` (Task 5에서 쓴다)
  - 코드 생성: `RANDOM`으로 6자를 뽑고, 충돌하면 최대 5번 다시 뽑는다.

- [ ] **Step 1: e2e 테스트**
  - 게스트가 share를 호출하면 403
  - 연동된 14세 이상이 share → 코드 6자, 문자 집합 안
  - 스캐너가 adult를 돌려주면 422이고, 이후 `GET /clickers/:id`는 404
  - 게스트 수령 → 보관함에 추가, `friendAdded:false`, `friendBlockedReason:'LINK_REQUIRED'`
  - 같은 코드를 두 번 수령하면 두 번째는 `alreadyOwned:true`이고 항목은 1개
  - 수령자 칸이 가득 차면 409, 항목은 그대로
  - `FakeClock`을 7일 1분 뒤로 옮기면 404 `CODE_INVALID`
  - 둘 다 연동된 14세 이상, `allowFriend` + `addFriend` → `GET /friends`에 서로 보인다
  - 내 코드를 내가 수령하면 409 `OWN_CLICKER`
  - 제작자가 수정(PUT)해도 받은 사람의 `GET /inventory`는 새 version을 돌려준다(원본 참조)
- [ ] **Step 2:** 실행해서 실패하는지 확인한다.
- [ ] **Step 3:** 구현한다. 수령은 트랜잭션으로 처리한다.
- [ ] **Step 4:** 실행해서 통과하는지 확인한다.
- [ ] **Step 5: Commit** `feat(server): share codes, redeem, friendships`

---

### Task 5: 플레이 기록 · 랭킹 · 소식

**Files:**
- Create: `src/plays/plays.module.ts`, `plays.service.ts`, `plays.controller.ts`, `src/rankings/rankings.service.ts`, `rankings.controller.ts`, `src/news/news.service.ts`, `news.controller.ts`, `src/common/kst.ts`, `test/plays.e2e-spec.ts`
- Modify: `schema.prisma` (+`PlayRecord`, `ClickerStat`, `NewsItem`), Task 4의 `NewsService` 임시 구현을 실제 구현으로 교체

**Interfaces:**
- Consumes: `ClickersService.getVisible`, `FriendsService.friendIdsOf`, `NOTIFIER`, `CLOCK`
- Produces:
  - `kst.ts`: `kstDay(d: Date): string /*YYYY-MM-DD*/`, `kstWeekStart(d: Date): Date /*월요일 00:00 KST의 UTC 시각*/`
  - `POST /plays { clickerId, mode, score, maxCombo, taps, durationMs }`
    - 보관함에 있는 클릭커만 기록할 수 있고, 없으면 403 `NOT_IN_INVENTORY`
    - Global Constraints의 검증을 위반하면 422 `PLAY_REJECTED`(기록하지 않음)
    - `ClickerStat` 최고 기록과 누적을 갱신한다.
    - `PlaysService`는 이벤트 `play.recorded {accountId, clickerId, creatorId, mode, maxCombo, taps}`를 발행한다(`@nestjs/event-emitter`). Task 6이 구독한다.
    - **친구 기록 소식**: 플레이어가 클릭커 제작자와 친구이고 이번 기록이 그 친구의 해당 클릭커 최고 콤보를 갱신하면, 제작자에게 `NewsItem(type='friend_record')`를 남기고 `NOTIFIER`로 "<친구>가 네 클릭커로 N콤보!"를 보낸다. 친구 이름은 아직 없으므로 v1에서는 `"친구"`로 쓴다.
  - `GET /rankings/friends?metric=maxCombo|totalTaps|creatorPopularity&period=week|all`
    - 나와 친구들의 순위 `[{ accountId, value, rank, me: bool }]`
    - `week`는 `playedAt >= kstWeekStart(now)`인 기록만 센다.
    - `creatorPopularity` = 내가 만든 클릭커들의 (받은 횟수 + 다른 사람의 플레이 수)
  - `GET /news?unread=true`, `POST /news/:id/read`

- [ ] **Step 1: 단위 테스트** `src/common/kst.spec.ts`
  - `kstDay(2026-10-31T14:59:59Z) = '2026-10-31'`
  - `kstDay(2026-10-31T15:00:00Z) = '2026-11-01'`
  - `kstWeekStart(2026-11-01T15:00:00Z /*월 00:00 KST*/) = 2026-11-01T15:00:00Z`
  - `kstWeekStart(2026-11-01T14:59:59Z) = 2026-10-25T15:00:00Z`
- [ ] **Step 2: e2e 테스트**
  - 100탭에 `durationMs` 1000이면 422(초당 100)
  - `maxCombo 11 > taps 10`이면 422
  - 보관함에 없는 클릭커면 403
  - 정상 기록 두 번이면 `bestCombo`는 최대값, `totalTaps`는 합
  - 친구 A가 B의 클릭커로 30콤보를 세우면 B의 `/news`에 1건, `RecordingNotifier`에 1건
  - 같은 A가 20콤보를 하면 소식이 추가되지 않는다(갱신 아님)
  - 주간 랭킹: 지난주 기록은 `period=week`에서 빠지고 `all`에는 들어간다
  - 친구가 아닌 사람은 랭킹에 나오지 않는다
- [ ] **Step 3:** 실행해서 실패하는지 확인한다.
- [ ] **Step 4:** 구현한다. `@nestjs/event-emitter`를 설치하고 `EventEmitterModule.forRoot()`를 등록한다.
- [ ] **Step 5:** 실행해서 통과하는지 확인한다.
- [ ] **Step 6: Commit** `feat(server): play records, friend rankings, news`

---

### Task 6: 일일 퀘스트 · 조각

**Files:**
- Create: `src/quests/quest-pool.ts`, `quests.service.ts`, `quests.controller.ts`, `quests.listener.ts`, `test/quests.e2e-spec.ts`
- Modify: `schema.prisma` (+`DailyQuest`), `src/share/share.service.ts`(수령 성공 시 `share.redeemed` emit)

**Interfaces:**
- Consumes: 이벤트 `play.recorded`, `share.redeemed {receiverId, creatorId}`(Task 4에 emit을 추가), `CLOCK`, `RANDOM`
- Produces:
  - `QUEST_POOL: QuestDef[]`, `QuestDef = { key: string; target: number; reward: 1|2; event: 'play'|'combo'|'friend_play'|'redeem'; title: string }`
    - 초기 풀:

      | key | target | reward | event | title |
      |---|---|---|---|---|
      | `taps_1000` | 1000 | 1 | play(taps 합) | "클릭 1,000번" |
      | `combo_30` | 30 | 1 | combo(maxCombo 최대) | "콤보 30 달성" |
      | `friend_play_2` | 2 | 1 | friend_play(남이 만든 클릭커 플레이, 서로 다른 클릭커 수) | "친구 클릭커 2개 눌러보기" |
      | `timed_3` | 3 | 1 | play(mode=timed10 횟수) | "10초 챌린지 3판" |
      | `redeem_1` | 1 | 2 | redeem | "친구 클릭커 1개 받기" |
      | `taps_3000` | 3000 | 2 | play | "클릭 3,000번" |

  - `GET /quests/today`: 오늘(KST)의 퀘스트가 없으면 `RANDOM`으로 풀에서 4개를 골라 만든다(같은 날 같은 결과).
    - 응답 `[{ key, title, target, progress, reward, claimed }]`
  - 리스너는 이벤트마다 오늘 퀘스트의 progress를 올린다(target 상한).
  - `POST /quests/:key/claim`: 완료됐고 아직 받지 않았으면 `shards += reward`, `claimedAt` 기록 → `{ shards }`
    - 이미 받았으면 409 `ALREADY_CLAIMED`
    - 미완료면 409 `QUEST_INCOMPLETE`
    - 조건부 update(`claimedAt IS NULL`)로 동시 요청에도 한 번만 지급한다.

- [ ] **Step 1: e2e 테스트**
  - 같은 날 두 번 조회하면 같은 4개
  - FakeClock을 KST 자정 넘어로 옮기면 새 목록이고, 어제 진행도는 오늘로 이어지지 않는다
  - play 이벤트로 `taps_1000` 진행 후 claim → shards +1
  - **claim 두 개를 `Promise.all`로 동시에 보내면 shards는 +1만, 하나는 409**
  - 미완료 claim은 409 `QUEST_INCOMPLETE`
  - (Random을 고정해 해당 퀘스트가 뽑히게 한 상태에서) 내가 만든 클릭커 플레이는 `friend_play`에 세지 않는다
- [ ] **Step 2:** 실행해서 실패하는지 확인한다.
- [ ] **Step 3:** 구현한다.
- [ ] **Step 4:** 실행해서 통과하는지 확인한다.
- [ ] **Step 5: Commit** `feat(server): daily quests and shards`

---

### Task 7: 스위치 카탈로그 · 뽑기 · 장착

**Files:**
- Create: `prisma/seed.ts`(스위치 카탈로그), `src/gacha/gacha.math.ts`, `gacha.service.ts`, `gacha.controller.ts`, `src/inventory/equip.controller.ts`, `test/gacha.e2e-spec.ts`, `src/gacha/gacha.math.spec.ts`
- Modify: `schema.prisma` (+`Switch`, `OwnedSwitch`, `GachaPull`), `InventoryService`(장착 필드), `src/accounts/accounts.service.ts`(신규 계정에 기본 스위치 지급)

**Interfaces:**
- Consumes: `RANDOM`, `game.config.ts` 수치
- Produces:
  - 시드 카탈로그(v1 = 사운드·이펙트만, 설계 §6.6)
    - 사운드: `clicky`(common), `tactile`(common), `thock`(common), `pop`(rare), `coin`(rare), `boing`(epic), `laser`(legend)
    - 이펙트: `press_basic`(common), `sparks`(common), `stars`(rare), `shards`(rare), `spin90`(epic), `aura`(legend, 상시 파티클)
    - 신규 계정은 각 kind의 common 1개(`clicky`, `press_basic`)를 기본으로 갖는다. 계정을 만들 때 지급한다(Task 2의 upsert에 추가).
    - `assetJson`은 모바일 엔진이 해석할 프리셋 이름(예: `{ "preset": "spin90" }`)이다.
  - `gacha.math.ts`의 `pickGrade(r: number, pity: number): Grade`
    - `pity >= 19`(이번이 20번째)이면 epic 이상 안에서 비율대로 뽑는다(epic 7 : legend 1).
    - 그 외에는 70/22/7/1 누적 구간으로 정한다.
  - `pickSwitch(grade, r2): Switch`: 해당 등급 안에서 균등하게 고른다.
  - `GET /gacha/rates` (@Public) → 등급 확률, 등급별 목록, 천장 설명. 확률 공개용(설계 §3).
  - `POST /gacha/pull { requestId: uuid }`
    - 조각이 5 미만이면 409 `NOT_ENOUGH_SHARDS`
    - 결과 `{ switch, grade, duplicate, refund, shards, pityCounter }`
    - 중복이면 등급별 조각을 환급한다.
    - epic 이상이 나오면 `pityCounter=0`, 아니면 +1
    - **같은 requestId 재요청은 같은 결과를 돌려주고 조각은 한 번만 차감**한다(unique 제약 + 조회).
  - `GET /switches/owned`
  - `PUT /inventory/:itemId/equip { sound?: switchId, effect?: switchId }`
    - 내가 가진 스위치만 장착할 수 있고, 아니면 403 `SWITCH_NOT_OWNED`
    - kind가 다르면 400 `SWITCH_KIND_MISMATCH`
    - 장착하지 않은 칸은 클릭커 `specJson.defaultEquip`을 쓴다(GET /inventory의 `equip`에 반영). 그래서 받은 클릭커는 제작자 구성을 기본으로 체험한다(설계 §6.3).

- [ ] **Step 1: 단위 테스트** `gacha.math.spec.ts`
  - `pickGrade(0.0,0)=common`, `pickGrade(0.6999,0)=common`, `pickGrade(0.70,0)=rare`, `pickGrade(0.92,0)=epic`, `pickGrade(0.99,0)=legend`
  - `pickGrade(0.0,19)`은 epic 또는 legend
  - `r ∈ [0,1)`를 1만 개 균등 표본으로 돌리면 등급 빈도가 기대치 ±1.5%p 안
- [ ] **Step 2: e2e 테스트**
  - 조각 4개면 409
  - 조각 5개, Random 고정 → 정해진 스위치 획득, shards 0
  - 이미 가진 common을 다시 뽑으면 `duplicate:true, refund:1`
  - 같은 requestId로 두 번 → 같은 결과, 차감 1번
  - pityCounter 19 상태에서 Random 0.0 → epic 이상
  - 남의 스위치 장착은 403. 받은 클릭커의 `GET /inventory`에 제작자 기본 장착이 보인다.
  - `/gacha/rates`는 인증 없이 200이고 확률 합이 100
- [ ] **Step 3:** 실행해서 실패하는지 확인한다.
- [ ] **Step 4:** 구현한다. 뽑기는 트랜잭션에서 `shards >= 5` 조건부 차감으로 처리한다.
- [ ] **Step 5:** 실행해서 통과하는지 확인한다.
- [ ] **Step 6: Commit** `feat(server): switch catalog, gacha with pity, equip`

---

### Task 8: 신고 · 차단

**Files:**
- Create: `src/reports/reports.module.ts`, `reports.service.ts`, `reports.controller.ts`, `test/reports.e2e-spec.ts`
- Modify: `schema.prisma` (+`Report`, `Block`), `src/blocks/blocks.service.ts`(Task 4 임시 구현을 실제로), `blocks.controller.ts`

**Interfaces:**
- Consumes: `ClickersService`, `InventoryService`
- Produces:
  - `POST /reports { clickerId, reason, note? }`: 게스트도 신고할 수 있다(설계 §6.9).
    - 즉시 `clicker.hidden=true`로 바꾸고 `Report(status='pending')`을 만든다.
    - 같은 사람이 같은 클릭커를 다시 신고하면 200(멱등)이다.
    - 제작자의 `pending`+`removed` 신고 대상 클릭커가 서로 다른 3개 이상이면 `uploadRestricted=true`(Global Constraints)
  - `ReportsService.resolve(reportId, 'restored'|'removed')`: 관리자 웹(계획 4)이 쓴다. v1 테스트에서는 서비스를 직접 호출한다.
    - restored면 hidden을 해제한다.
  - `POST /blocks { accountId }`, `DELETE /blocks/:accountId`, `BlocksService.isBlocked(a,b)`(양방향)
  - hidden 클릭커는 `GET /inventory`, `GET /clickers/:id`, `POST /plays`, `POST /share/:code/redeem`에서 모두 보이지 않거나 거부된다. Task 3~5가 쓰는 `getVisible`로 이미 처리되는지 여기서 확인한다.

- [ ] **Step 1: e2e 테스트**
  - 받은 사람이 신고하면 제작자 `GET /clickers/:id`가 404, 다른 수령자의 `GET /inventory`에서도 빠진다
  - 신고 후 그 클릭커로 `POST /plays` → 404 `CLICKER_UNAVAILABLE`
  - 신고 후 코드 수령 → 404
  - `resolve(restored)` 후 다시 보인다
  - 서로 다른 클릭커 3개가 신고되면 제작자 `GET /me`의 `capabilities.publishMarket.reason = 'UPLOAD_RESTRICTED'`
  - B가 A를 차단하면 A의 코드를 B가 수령할 수 없다(404 `CODE_INVALID`). A가 B 코드를 수령하는 것도 마찬가지다.
  - 같은 신고를 반복해도 Report는 1건
- [ ] **Step 2:** 실행해서 실패하는지 확인한다.
- [ ] **Step 3:** 구현한다.
- [ ] **Step 4:** 실행해서 통과하는지 확인한다.
- [ ] **Step 5: Commit** `feat(server): reports with instant hide, blocks`

---

### Task 9: 보관함 칸 구매 (테스트 결제)

**Files:**
- Create: `src/purchases/products.ts`, `purchases.service.ts`, `purchases.controller.ts`, `test/purchases.e2e-spec.ts`
- Modify: `schema.prisma` (+`Purchase`)

**Interfaces:**
- Consumes: `PURCHASE_VERIFIER`, `@RequireCapability('purchase')`
- Produces:
  - `PRODUCTS = { slots_3: { slots: 3 } }`
  - `POST /purchases/verify { platform, productId, receipt }`
    - 모르는 상품이면 400 `UNKNOWN_PRODUCT`
    - 검증에 실패하면 402 `RECEIPT_INVALID`
    - 같은 `transactionId`면 200이고 지급하지 않는다(`alreadyApplied:true`)
    - 지급 후 칸이 `maxSlots`(30)를 넘으면 409 `SLOTS_AT_MAX`이고 지급하지 않는다. 설계 §6.1의 "최대치면 지우고 만들기만"에 해당한다.
    - 성공하면 `{ storageSlots }`
  - 실제 App Store / Play 영수증 검증 구현은 앱 계획 3에서 `PurchaseVerifier` 구현을 교체한다.

- [ ] **Step 1: e2e 테스트**
  - 게스트는 403
  - valid 영수증이면 6→9
  - 같은 transactionId를 두 번 보내면 9 유지, `alreadyApplied:true`
  - **같은 영수증 두 개를 `Promise.all`로 동시에 보내도 9** (pk 충돌 처리)
  - 칸 30에서 구매하면 409
  - invalid면 402
- [ ] **Step 2:** 실행해서 실패하는지 확인한다.
- [ ] **Step 3:** 구현한다. 트랜잭션에서 Purchase insert와 slots 증가를 함께 처리한다.
- [ ] **Step 4:** 실행해서 통과하는지 확인한다. 전체 `pnpm test && pnpm test:e2e && pnpm lint && pnpm build`도 통과해야 한다.
- [ ] **Step 5: Commit** `feat(server): storage slot purchase with idempotent verification`

---

## 이 계획에서 하지 않는 것 (다른 계획으로)
- 실제 Google Cloud Vision 스캐너와 AI 신고 분류, 관리자 웹 → **계획 4**
- App Store / Play 영수증 실검증, 딥링크 도메인(Universal/App Links 파일 호스팅) → **계획 3**
- 앱의 Firebase 로그인, 기기 저장, 업로드 시점 연결 → **계획 2**
- 배포(관리형 호스팅) → v1 테스터 배포 직전에 별도로 진행
