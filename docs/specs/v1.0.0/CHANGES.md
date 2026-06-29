## [012-settlement-completed-at] 구현 완료

> base `3735377`(011 정식 SDD 문서 커밋 — 코드는 011 완료 `88de003` 와 동일) → `35791d6`(012 완료). 변경 라인은 `git diff 3735377 35791d6 -- apps/backend`로 재생성. 마이그레이션 012(`Order.completedAt` nullable 컬럼 추가 — 비파괴 `ADD COLUMN`, migrate dev 적용).

**변경 파일**:
- `apps/backend/prisma/schema.prisma`: `Order` 모델에 nullable `completedAt DateTime?`(주석: 구매 확정 일시 — 정산 집계 기준 시각, 012 GAP-005-02) 추가. `deliveredAt`(005)와 동형.
- `apps/backend/prisma/migrations/20260629115624_012_order_completed_at/migration.sql`(신규): `ALTER TABLE "orders"."orders" ADD COLUMN "completedAt" TIMESTAMP(3)`. 비파괴 nullable 추가.
- `apps/backend/src/modules/order/order.repository.ts`: `updateStatus(orderId, status, extra?)` 의 `extra` 타입에 `completedAt?: Date` 추가(`data:{ status, ...extra }`, 선택 속성 확장) + `findCompletedItemsBySellerInPeriod` 의 기간 필터를 `createdAt:{ gte, lte }` → `completedAt:{ gte, lte }` 로 전환(시그니처·반환 형태 불변).
- `apps/backend/src/modules/order/order.service.ts`: `complete`(delivered→completed) 가 `updateStatus(orderId, completed, { completedAt: new Date() })`, `autoConfirmDelivered(now)` 가 각 주문 `updateStatus(order.id, completed, { completedAt: now })` 로 구매 확정 시각 기록(양 completed 전이 경로).
- `apps/backend/src/modules/order/order.service.spec.ts`: `complete`·`autoConfirmDelivered` 테스트의 `updateStatus` 단언을 completedAt 포함하도록 갱신(신규 it() 0건 — 단언만 강화).

**검증**: tsc 0 / unit 25 suites·253 PASS(011 대비 변화 없음 — 신규 단위 추가 없이 complete·autoConfirm 단언만 갱신, 회귀 0) / e2e+static 16 suites·84 PASS(P95 e2e 1회 콜드스타트 플레이키 관측 → 재실행 84 PASS 확인). 마이그레이션 012(`completedAt` nullable 컬럼 추가, 비파괴, `migrate status` up-to-date).

**해결**: **GAP-005-02(정산 기간 필터가 주문 createdAt 기준, Low~Medium) 완전 해결** — `Order.completedAt` 컬럼 추가 + completed 전이 2경로(구매자 `complete`·시스템 `autoConfirmDelivered`)에서 completedAt 기록 + 정산 집계 필터 `createdAt → completedAt` 전환. 정산 집계가 주문 생성 시각이 아닌 구매 확정 시각 기준으로 기간을 산정하여, 주문 생성·완료 시점이 다를 때의 정산 주기 귀속 오차를 제거. 005-shipping-settlement/gaps.md 의 GAP-005-02 를 RESOLVED(012)로 갱신.

**후속 작업 시 주의사항**:
- **과거 completed 주문 completedAt=NULL(GAP-012-01, Low)**: 본 변경 이전 completed 로 전이된 주문은 `completedAt=NULL`(비파괴 추가, 백필 없음)이라 `completedAt` 기준 정산 필터에서 제외된다. 그린필드(실 운영 데이터 없음)라 영향이 없으나, 운영 데이터 이행 시 과거 completed 주문의 completedAt 백필(`order_events` 의 toStatus=completed 행 createdAt 기준)이 필요하다(범위 외).
- **정산 필터 전환 직접 테스트 부재(GAP-012-01, Low)**: `findCompletedItemsBySellerInPeriod` 의 completedAt 기준 필터를 직접 단언하는 자동 테스트가 없다(`settlement.service.spec` 이 OrderService mock — 필터가 mock 경계 아래). `order.service.spec` 의 completedAt 기록 단언(SC-001·002)으로 간접 커버하며, 필터 전환은 정적 코드 검증(SC-003). 실 PostgreSQL 정산 집계 통합 테스트 후속 권고(coverage-gap.md).
- **completed 전이 경로 전수 = 2개**: `OrderStatus.completed` 전이는 `complete`(구매자)·`autoConfirmDelivered`(시스템) 2경로뿐이며 양쪽 모두 completedAt 을 기록한다. 향후 completed 전이 경로를 추가하면 반드시 `completedAt` 기록을 포함해야 정산 필터 정합이 유지된다(SC-001·002 단언으로 회귀 탐지).
- **updateStatus extra 확장은 비파괴**: `extra` 가 선택 인자·선택 속성이라 completedAt 미전달 전이(`confirmBySeller`·`cancel`·`markShipped`·`markConfirmed`)는 불변. `markDelivered` 는 005 기존 `{ deliveredAt }` 전달. 향후 전이 메타 추가 시 동일 extra 패턴 사용.

---

## [011-file-security] 구현 완료

> base `cfa787c`(010 SDD 문서 커밋) → `88de003`(011 완료). 변경 라인은 `git diff cfa787c 88de003 -- apps/backend`로 재생성. 마이그레이션 없음(스키마 변경 0 — FileAsset 기존 status/size 컬럼 재사용).

**변경 파일**:
- `apps/backend/src/modules/file/file.service.ts`: `getById` 시그니처 `(id)` → `(userId, id)` + 소유권 검증(`findById → null` 404, `ownerId !== userId` → 403 ForbiddenException, 본인 메타 반환 — 메타 IDOR 차단). `presign` 진입부에서 `ALLOWED_CONTENT_TYPES`(image/jpeg·png·webp·gif) allowlist 검증(외 contentType → 400, create 이전·repo 미호출). `confirm(userId, id, size)` 신규 — size 검증(`!Number.isInteger || <=0 || > MAX_FILE_SIZE_BYTES` → 400, findById 이전) → 미존재 404 → 타인 403 → 이미 UPLOADED 멱등(no-op) → PENDING 이면 `updateStatus(id, UPLOADED, size)`. `ForbiddenException`·`BadRequestException` import 추가.
- `apps/backend/src/modules/file/file.constants.ts`(신규): `ALLOWED_CONTENT_TYPES`(이미지 4종)·`MAX_FILE_SIZE_BYTES`(10MiB).
- `apps/backend/src/modules/file/dto/confirm-file.dto.ts`(신규): `ConfirmFileDto { @IsInt @Min(1) size }`.
- `apps/backend/src/modules/file/file.repository.ts`: `updateStatus(id, status, size)` 신규(files.files 전용 — `fileAsset.update`).
- `apps/backend/src/modules/file/file.controller.ts`: `GET /files/:id`(소유자 전용 — `@CurrentUser().userId` 주입) + `POST /files/:id/confirm`(신규 라우트). FileController 기존 `@UseGuards(JwtAuthGuard)`.
- `apps/backend/src/modules/file/file.service.spec.ts`: 단위 테스트 8건 추가(7→15) — describe `presign` 1(allowlist 거부) + `getById` 2(본인 반환·타인 403) + `confirm (GAP-006-02)` 6(전이·타인·미존재·멱등·상한·비양수).

**검증**: tsc 0 / unit 25 suites·253 PASS(010 대비 +8 = presign 1 + getById 2 + confirm 6, 회귀 0) / e2e+static 16 suites·84 PASS(변화 없음 — 011 전용 신규 e2e/static 없음). schema·마이그레이션 변경 0(FileAsset 기존 status/size 재사용). `getById` breaking 시그니처 잔여 참조 0(controller 1건 갱신).

**해결**: **SEC-FIND-006-01(파일 메타 IDOR, Low) / SEC-FIND-006-02(presign 입력 무검증, Low) / GAP-006-02(confirm 부재, Low) 완전 해결** — 메타 소유자 전용 조회(`getById` 소유권 403/404) + presign MIME allowlist(비허용 → 400·repo 미호출) + 업로드 confirm(PENDING→UPLOADED 전이·size 기록·멱등). 임의 인증 사용자가 타인 파일 메타를 조회하거나 비허용 콘텐츠를 presign 하는 경로, 고아 PENDING 누적 경로 차단. 006-search-notification-file/security/security-report.md(SEC-FIND-006-01·02)·gaps.md(GAP-006-02·03·04)·test/coverage-gap.md 의 해당 항목을 RESOLVED(011)로 갱신.

**후속 작업 시 주의사항**:
- **메타 엔드포인트 소유자 전용 = 공개 표시와 분리**: `GET /files/:id` 는 소유자 전용으로 막혔으나, 상품·리뷰 이미지의 공개 표시는 presign 응답·도메인 레코드에 저장된 `publicUrl` 을 직접 사용하는 경로이지 메타 엔드포인트를 거치지 않는다. 향후 비공개 purpose 가 필요해지면 현재 일괄 소유자 전용 모델 위에서 분기를 추가한다.
- **confirm size 는 클라이언트 신뢰 기반(GAP-011-01, Low)**: confirm 의 `size` 상한(`MAX_FILE_SIZE_BYTES`) 검증은 클라이언트 보고값 기반이며 실제 업로드 크기를 교차검증하지 않는다(stub 무네트워크). 실제 R2 전환 시 confirm 시점 객체 HEAD·presign content-length-range 로 교차검증 필요(범위 외 — gaps.md·coverage-gap.md).
- **`getById` breaking 시그니처**: `getById(id)` → `getById(userId, id)`. 향후 file 메타를 조회하는 신규 호출 측을 추가하면 반드시 인증 사용자 id 를 전달해야 소유권 검증이 유지된다(현재 호출 측은 FileController 단일).
- **confirm 검증 순서 보존**: size 검증을 `findById` 보다 먼저 수행(SC-009 의 findById 미호출 단언으로 고정). 멱등 분기(이미 UPLOADED → updateStatus 미호출)는 최초 size 를 보존한다. 향후 confirm 로직 변경 시 이 순서·멱등을 유지(SC-005~010 단언으로 회귀 탐지).
- **메타 IDOR·confirm e2e 부재**: HTTP `GET /files/:id`(타인 403)·`POST /files/:id/confirm`(200) end-to-end 통합 테스트는 없다(service 단위 검증으로 갈음 — coverage-gap.md). 후속 보강 권장.

---

## [010-coupon-discount-validation] 구현 완료

> base `6fe1588`(009 완료) → `2664da3`(010 완료). 변경 라인은 `git diff 6fe1588 2664da3 -- apps/backend`로 재생성. 마이그레이션 없음(스키마 변경 0 — Coupon 테이블 기존 Decimal 필드 재사용).

**변경 파일**:
- `apps/backend/src/modules/coupon/coupon.service.ts`: `_assertValidDiscount(data)` 신규(생성 입력 검증 — `discountValue.lte(0) → 400`, `PERCENTAGE && gt(100) → 400`, `maxDiscountAmount.lt(0) → 400`, `minOrderAmount.lt(0) → 400`) + `createCoupon`·`createSellerCoupon`(판매자는 `getApprovedSeller` 이후) 에서 호출(위반 시 repo 미호출, 저장 차단). `_calcDiscount` 가 FIXED·PERCENTAGE 결과를 `Prisma.Decimal.max(0, min(...))` 로 0 floor(음수 할인=과다청구 심층 방어). `BadRequestException` import 추가.
- `apps/backend/src/modules/coupon/coupon.service.spec.ts`: 단위 테스트 6건 추가 — describe `createCoupon — discountValue 검증 (SEC-001)` 5건(음수·0·PERCENTAGE>100·음수 maxDiscount·판매자 음수) + `validateAndCalculateDiscount` 내 floor 방어 1건(음수 discountValue → discountAmount='0').

**검증**: tsc 0 / unit 25 suites·245 PASS(009 대비 +6 = 쿠폰 검증 5 + floor 방어 1, 회귀 0) / e2e+static 16 suites·84 PASS(변화 없음 — 010 전용 신규 e2e/static 없음). DTO·repository·schema·마이그레이션 변경 0(service 레벨만).

**해결**: **SEC-001(쿠폰 할인값 검증 누락 과다청구, Medium) / GAP-003 완전 해결** — 생성 검증(`_assertValidDiscount`, 주) + 계산 0 floor(`_calcDiscount`, 심층) + 단위 테스트 6건의 이중 방어. 악의적 admin/판매자가 음수 discountValue 쿠폰을 생성→발급→적용 시 `totalAmount−(음수)` 과다청구하는 경로 차단. 004-review-coupon/security/security-report.md·gaps.md·test/coverage-gap.md 의 SEC-001 관련 항목을 RESOLVED(010)로 갱신.

**후속 작업 시 주의사항**:
- **검증 권위는 service 단일**: `CreateCouponDto` 는 `@IsDecimal()` 만(010 미변경)이며 부호·범위 보장은 `_assertValidDiscount` 가 단일 권위로 강제한다(PERCENTAGE 조건부 ≤100 은 class-validator 타입 분기 곤란). 향후 쿠폰 생성 경로(신규 발급 메서드 등)를 추가하면 반드시 `_assertValidDiscount` 호출을 포함해야 동일 방어가 유지된다.
- **DTO 레벨 음수 거부 e2e 부재**: HTTP body 음수 discountValue → 400 의 end-to-end 통합 테스트는 없다(service 단위 검증으로 갈음 — coverage-gap.md). 후속 보강 권장.
- **minOrderAmount 음수 거부 전용 테스트 부재**: FR-001 (d) 분기는 구현·동작하나 전용 단위 테스트가 없다(동형 분기 maxDiscountAmount 음수 — SC-004 로 커버). SC-004 와 동형 테스트 추가 권장.
- **계산 0 floor 는 최종 안전망**: `_calcDiscount` 의 `Decimal.max(0, ...)` 는 생성 검증을 우회하거나 기존에 잔존하는 음수 쿠폰에 대한 심층 방어다. 향후 할인 계산 로직 변경 시 이 0 floor 를 제거하지 않도록 주의(SC-006 단언으로 회귀 탐지).

---

## [009-notification-events] 구현 완료

> base `e97a142`(008 완료) → `b3793fa`(009 완료). 변경 라인은 `git diff e97a142 b3793fa -- apps/backend`로 재생성. 마이그레이션 없음(스키마 변경 0 — 006 Notification 테이블·enum 재사용).

**변경 파일**:
- `apps/backend/src/modules/notification/notification.events.ts`: `NotificationEventsHandler` 신규(@Injectable, @OnEvent 4종) — 구독자 패턴으로 도메인 이벤트 구독 후 알림 생성. order.created→구매자 ORDER_PLACED, shipping.shipped→`getOrderOwnership(orderId).userId` 구매자 ORDER_SHIPPED, settlement.created→`getUserIdBySellerId` 판매자 SETTLEMENT_CREATED, review.created→`getSellerIdByProductId`→`getUserIdBySellerId` 판매자 REVIEW_RECEIVED. 수신자 해석 read-only Service DI(P-001). `safeNotify`(try/catch+Logger) 실패 격리 — 알림 실패가 원 흐름에 전파 안 됨. 수신자 미해석(null) 시 알림 생략.
- `apps/backend/src/modules/notification/notification.events.spec.ts`: 핸들러 단위 테스트 신규 8건(SC-001~005 — 4종 이벤트 happy + 격리/미해석/소유권 예외).
- `apps/backend/src/modules/notification/notification.module.ts`: imports(Order·Seller·Product) + `NotificationEventsHandler` provider 추가. 순환 의존 없음(도메인 모듈은 notification 미import — AppModule 부팅 검증).
- `apps/backend/src/modules/order/order.events.ts`·`order.service.ts`: `OrderCreatedPayload{orderId,userId}` + `createOrder` 커밋 후 `order.created` emit(additive, EventEmitter2 DI). `order.service.spec.ts`: EventEmitter2 mock 추가(회귀 0).
- `apps/backend/src/modules/settlement/settlement.events.ts`·`settlement.service.ts`: `SETTLEMENT_EVENTS.CREATED` + `SettlementCreatedPayload{settlementId,sellerId}` + `createSettlement` 커밋 후 `settlement.created` emit(additive, 식별자만·금액 미포함). `settlement.service.spec.ts`: EventEmitter2·onAfterCommit mock 추가(회귀 0).
- `apps/backend/src/modules/seller/seller.service.ts`: `getUserIdBySellerId(sellerId)` read-only 추가(additive — sellers 자기 스키마, 미존재 null).
- `apps/backend/src/modules/product/product.service.ts`: `getSellerIdByProductId(productId)` read-only 추가(additive — products 자기 스키마, 미존재 null).

**검증**: tsc 0 / unit 25 suites·239 PASS(008 대비 +8 = notification.events.spec 8, 회귀 0) / e2e+static 16 suites·84 PASS(변화 없음 — 009 전용 신규 e2e 없음) / AppModule 부팅 정상(NotificationModule imports Order/Seller/Product + EventsHandler provider, 순환 의존 없음). 마이그레이션 없음.

**해결**: **GAP-006-01(알림 도메인 이벤트 미연동, Low) 완전 해결** — NotificationType 4종(ORDER_PLACED·ORDER_SHIPPED·SETTLEMENT_CREATED·REVIEW_RECEIVED) 전부 실제 생성 경로 확보. 006-search-notification-file/gaps.md·coverage-gap.md 의 해당 항목을 RESOLVED(009)로 갱신.

**후속 작업 시 주의사항**:
- **이벤트→알림 생성→조회 e2e 부재**: 핸들러 단위 테스트(mock)로 4종 분기·수신자 해석·격리를 직접 단언하나, 실 emit→DB insert→`GET /notifications` 조회의 end-to-end 통합 시나리오 테스트는 미작성(coverage-gap.md). 후속 보강 권장.
- **알림 전달 보장 없음**: `safeNotify` 는 실패를 격리(로깅)할 뿐 재시도하지 않는다. at-least-once 전달이 필요해지면 outbox·재시도 큐 도입 검토(범위 외).
- **수신자 해석 캐싱 없음**: 매 이벤트마다 Service DI findById 실시간 조회. 이벤트량 급증 시 캐싱 검토 가능(현재 부재가 곧 상태).
- **after-commit emit 누적**: `settlement.service.ts` 는 008(멱등 필터)과 009(settlement.created emit)가 동일 메서드에 누적됐다. 향후 정산 흐름 변경 시 멱등 제외 → 커밋 → emit 순서·EventEmitter2/onAfterCommit DI 정합성 재확인 필요.

---

## [008-settlement-idempotency] 구현 완료

> base `cf2c3d1` → `e97a142`(008 완료). 변경 라인은 `git diff cf2c3d1 e97a142 -- apps/backend`로 재생성.

**변경 파일**:
- `apps/backend/prisma/schema.prisma`: `SettlementItem.orderItemId` 에 `@unique` 추가(주석: 동일 주문항목 중복 정산 DB 수준 차단 — 008 SEC-FIND-005-01). 신규 테이블·컬럼·enum 0.
- `apps/backend/prisma/migrations/20260629183631_008_settlement_item_orderitem_unique/migration.sql`: `settlement_items_orderItemId_key` UNIQUE INDEX 생성(2줄). `migrate dev` 가 UNIQUE 경고로 비-TTY 실패 → 수동 폴더 생성 후 `migrate deploy` 적용(적용 전 DB 중복 0건 확인).
- `apps/backend/src/modules/settlement/settlement.repository.ts`: `findSettledOrderItemIds(orderItemIds)` 신규 — 자기 소유 테이블(`settlement_items`)에서 `orderItemId IN (...)` 조회 후 매칭 id 반환. 빈 입력 즉시 `[]`(P-001).
- `apps/backend/src/modules/settlement/settlement.service.ts`: `createSettlement` 이 후보(`getCompletedItemsForSettlement`) 중 기집계 orderItemId 를 `Set` 으로 제외 후 `totalSales`·`commission`(ROUND_HALF_UP)·`payoutAmount` 를 Prisma.Decimal 로 재계산. 남은 항목 0건이면 `createItems` 미호출(금액 0 정산 생성).
- `apps/backend/src/modules/settlement/settlement.service.spec.ts`: 멱등성 단위 테스트 2건 추가 — 일부 기집계→해당 항목만 집계(SC-001), 전체 기집계→0/createItems 미호출(SC-002).

**검증**: tsc 0 / unit 24 suites·231 PASS(007 대비 +2 = 멱등성 2, 회귀 0) / e2e+static 16 suites·84 PASS(변화 없음) / 마이그레이션 `settlement_items_orderItemId_key` UNIQUE INDEX 적용(`migrate status` up-to-date).

**해결**: **SEC-FIND-005-01(정산 중복집계, Medium) / GAP-005-01 완전 해결** — 애플리케이션 멱등 필터(`findSettledOrderItemIds`) + DB UNIQUE 제약(`orderItemId @unique`) + 단위 테스트의 3중 방어. 005-shipping-settlement/security/security-report.md·gaps.md 의 해당 항목을 RESOLVED(008)로 갱신.

**후속 작업 시 주의사항**:
- **DB UNIQUE P2002 자동 단언 부재**: 동시 재정산 경합 시 두 번째 insert 가 P2002 로 거부·롤백됨을 검증하는 통합 테스트가 없다(방어 심층화 — SC-003 은 schema/migration 구조 검증으로 갈음). 후속 통합 테스트(실 PostgreSQL + 동시 호출) 보강 권장.
- **정산 취소·정정 시 @unique 점유 해제 부재**: 현재 정산은 생성·조회만 지원하며 취소/정정 흐름이 없다. 취소·정정 도입 시 이미 집계된 `orderItemId` 의 UNIQUE 점유 해제 전략 필요.
- **마이그레이션 수동 적용 절차**: 기존 테이블에 UNIQUE 추가는 `migrate dev` 가 비-TTY 에서 실패하므로, 적용 전 중복 0건 확인 후 수동 폴더 생성 + `migrate deploy` 절차를 따른다(db-design/migrations/README.md).

---

## [007-banner-stats-admin] 구현 완료

**변경 파일**:
- `apps/backend/prisma/schema.prisma`: BannerPosition(admin) enum + Banner(신규 admin 스키마, `@@map("banners")`) 모델 추가. `banners(isActive, position, sortOrder)` 인덱스. FK 없음(단일 테이블, cross-schema 참조 컬럼 없음). **금전 필드 없음**(banner 한정 P-005 해당 없음).
- `apps/backend/prisma/migrations/20260629085122_007_banner_stats_admin/`: 마이그레이션(007 객체만 — 드리프트 동반 없음).
- `apps/backend/src/modules/banner/*`: repository·service·controller(Admin+공개)·module·dto(create/update) + service.spec(신규 11). admin.banners 단독 소유(P-001). 관리자 CRUD(POST 201·PATCH·DELETE 204·GET — JwtAuthGuard+AdminGuard) + 공개 GET /banners(무가드, isActive=true + 노출기간 `isWithinPeriod` 필터, sortOrder 순).
- `apps/backend/src/modules/stats/*`: repository(빈 클래스)·service·controller(Admin+Seller)·module + service.spec(신규 4). 자체 테이블 없음 — Order/User/Seller Service DI 조합(P-001). overview(총 주문·완료 주문·총 매출 Decimal·총 사용자·총 판매자 — JwtAuthGuard+AdminGuard), seller stats(본인 completed 매출 Decimal·건수 — JwtAuthGuard + getApprovedSeller 본인 격리).
- `apps/backend/src/modules/admin/*`: repository(빈 클래스)·service·controller·module·constants + service.spec(신규 5). 자체 테이블 없음 — Seller/User Service DI(P-001). listPendingSellers·approveSeller(SellerService.approve 재사용)·listUsers(cursor·민감 필드 제외·limit 1..100 클램프). 전부 JwtAuthGuard+AdminGuard.
- `apps/backend/src/modules/order/order.service.ts`·`order.repository.ts`: 집계 4종 공개 메서드 추가(additive) — countAllOrders·countCompletedOrders·sumCompletedSales(Decimal)·getSellerSalesSummary(Decimal mul/add 누적). orders 스키마 내 집계.
- `apps/backend/src/modules/user/user.service.ts`·`user.repository.ts`·`user.module.ts`: countAllUsers·listUsersForAdmin(AdminUserListItem password 제외 cursor) 추가(additive) + UserService export.
- `apps/backend/src/modules/seller/seller.service.ts`·`seller.repository.ts`: countAllSellers·listByStatus 추가(additive). approve 는 기존 재사용(로직 불변).
- `apps/backend/test/banner-admin.e2e-spec.ts`: AppModule 부팅 + 공개/인증/관리자 라우트(200/401/403) + 배너 노출기간 동작(활성 노출·미래 숨김) 검증(신규 8).
- `apps/backend/test/static/cross-schema.spec.ts`: Banner·Stats·AdminRepository 크로스 스키마 금지 규칙 반영(신규 3). `auth-required-guards.spec.ts`: banner·stats·admin 컨트롤러 JwtAuthGuard 정적 검증 대상 추가.

**검증**: tsc 0 / unit 24 suites·229 PASS(006 대비 +20 = banner 11 + stats 4 + admin 5, 회귀 0) / e2e+static 16 suites·84 PASS(신규 banner-admin.e2e 8 + cross-schema 규칙 3 포함) / AppModule 부팅 정상(BannerModule·StatsModule·AdminModule 3개 DI 등록).

**후속 작업 시 주의사항**:
- **관리자 audit log 부재(GAP-007-01, Low)**: 승인·삭제 등 관리자 조치를 기록하는 append-only 감사 로그 테이블이 없다(AdminRepository 빈 클래스). 보안 사고는 아니나 다수 관리자 운영 시 책임 추적을 위해 admin_audit_logs 후속 도입 검토.
- **배너 노출기간 in-memory 필터(GAP-007-02, Low)**: `listPublic` 이 `listActiveOrdered`(isActive=true) 조회 후 노출기간을 애플리케이션 레벨(`isWithinPeriod`)에서 필터한다. 배너 수 증가 시 startsAt/endsAt DB where 절 푸시다운 검토.
- **판매자 승인 병렬 라우트(OBS-007-01, Low)**: `SellerService.approve` 가 `PATCH /sellers/:id/approve`(seller) 와 `POST /admin/sellers/:id/approve`(admin) 두 라우트에서 호출된다(로직 중복 아님, 라우트 표면 둘). 두 경로 모두 AdminGuard 보호로 권한 표면 동일. 후속 정책 spec 에서 운영 라우트를 admin 으로 일원화 검토.
- **stats·admin 빈 Repository**: `StatsRepository`·`AdminRepository` 는 자체 테이블이 없어 빈 클래스이며 집계·운영은 도메인 Service DI 경유다. 자체 테이블이 정당화되기 전에는 확장하지 않는다(P-001).
- **도메인 additive 집계 메서드**: order/user/seller 에 통계·운영용 공개 집계 메서드가 추가됨. 향후 해당 도메인 상태머신·스키마 변경 시 이 집계 메서드(특히 매출 Decimal 산술·completed 필터)의 정합성 재확인 필요.

---

## [006-search-notification-file] 구현 완료

**변경 파일**:
- `apps/backend/prisma/schema.prisma`: NotificationType(users) + FilePurpose·FileStatus(files) enum, Notification(users 스키마)·FileAsset(신규 files 스키마, `@@map("files")`) 모델 추가. `notifications(userId, isRead, createdAt desc)` 인덱스, `file_assets.key @unique` + `(ownerId, createdAt desc)` 인덱스. cross-schema 참조(userId·ownerId) plain String(FK 미선언). **금전 필드 없음**.
- `apps/backend/prisma/migrations/20260629081946_006_search_notification_file/`: 마이그레이션(006 객체만 — 005 같은 드리프트 동반 없음).
- `apps/backend/src/modules/search/*`: service·controller·module·constants·dto + repository(빈 클래스, providers 미등록) + service.spec(신규 5). 자체 테이블 없음 — ProductService DI read-only(P-001). GET /search/products(공개) page/size 정규화·클램핑·정렬.
- `apps/backend/src/modules/notification/*`: repository·service·controller·module·constants·dto + service.spec(신규 8). create() 공개 진입점(export)·list(미읽음 우선·페이지네이션)·markRead(소유권 404/403)·markAllRead. JwtAuthGuard.
- `apps/backend/src/modules/file/*`: repository·service·controller·module·dto + file-storage.port·stub-file-storage + service.spec(신규 7). presign(key {purpose}/{userId}/{uuid}·PENDING 레코드·결정적 URL)·getById·delete(소유권). R2 연동 FileStoragePort + StubFileStorage(무네트워크, FILE_STORAGE 토큰, P-002). JwtAuthGuard.
- `apps/backend/src/modules/product/product.service.ts`·`product.repository.ts`: searchProducts 공개 메서드 추가 — additive, status `in [ACTIVE, OUT_OF_STOCK]`·title contains insensitive·Decimal 가격 필터·정렬 tiebreaker id desc·images include.
- `apps/backend/test/search-notification-file.e2e-spec.ts`: AppModule 부팅 + 공개/인증 라우트(200/401/400) 검증(신규 4).
- `apps/backend/test/static/cross-schema.spec.ts`: NotificationRepository·FileRepository 크로스 스키마 금지 규칙 반영(신규 2 규칙).

**검증**: tsc 0 / unit 21 suites·209 PASS(005 대비 +20 = search 5 + notification 8 + file 7, 회귀 0) / e2e+static 15 suites·73 PASS(신규 search-notification-file.e2e 포함) / AppModule 부팅 정상(SearchModule·NotificationModule·FileModule 3개 DI 등록).

**후속 작업 시 주의사항**:
- **알림 이벤트 미연동(GAP-006-01)**: `NotificationService.create()` 가 export 됐으나 주문·배송·정산·리뷰 이벤트 핸들러에서 호출하는 연동이 미구현. 알림이 실제로 생성되는 경로가 없으므로(공개 진입점만 제공) 후속 spec 에서 도메인 이벤트 핸들러 연동 필요.
- **파일 confirm 부재(GAP-006-02)**: FileStatus.PENDING → UPLOADED 확정 엔드포인트 부재. 클라이언트가 presigned URL 로 업로드 후 상태·size 갱신할 경로가 없어 고아 PENDING 레코드 누적 가능. 후속 confirm 엔드포인트 검토.
- **`GET /files/:id` 소유권 미검증(SEC-FIND-006-01, Low)**: 파일 메타가 소유권 검증 없이 임의 인증 사용자에게 노출. 현재 public URL 모델과 정합하나 비공개 purpose 도입 시 ownerId 검증 또는 공개/비공개 구분 필요.
- **presign 입력 무검증(SEC-FIND-006-02, Low)**: contentType allowlist·파일 크기 상한 미적용(size=0 placeholder). 실제 R2 presign 전환 시 content-type 바인딩·크기 제한 필요.
- **search 빈 Repository**: `SearchRepository` 는 자체 테이블이 없어 빈 클래스이며 `SearchModule` providers 에 미등록. 검색 전용 데이터 소유가 정당화되기 전에는 등록·확장하지 않는다(P-001).

---

## [005-shipping-settlement] 구현 완료 (경량 모드)

> 경량 모드: plan/design/test-cases/DIFF 문서 생략. 요구사항·수용 기준·구현 결과는 `005-shipping-settlement/spec/spec.md` 1장에 통합. 변경 라인은 git base `289b36f` 기준 `git diff 289b36f -- apps/backend`로 재생성.

**변경 파일**:
- `apps/backend/prisma/schema.prisma`: ShipmentStatus/SettlementStatus enum + Shipment·ShipmentTracking(orders 스키마), Settlement·SettlementItem(settlements 스키마) 추가. 금전 필드 `@db.Decimal(12,2)`.
- `apps/backend/prisma/migrations/20260629080659_005_shipping_settlement/`: 마이그레이션(004 드리프트 테이블 함께 캡처 — 후속 주의사항 참조).
- `apps/backend/src/modules/shipping/*`: repository·service·controller·module·events·dto + service.spec(신규 15). 송장 등록(preparing→shipped)·배송완료·추적조회(권한 3축).
- `apps/backend/src/modules/settlement/*`: repository·service·controller·module·constants(COMMISSION_RATE=0.1)·dto + service.spec(신규 6). 정산 생성·본인/관리자 조회, Decimal 정확 계산.
- `apps/backend/src/modules/order/order.service.ts`: 공개 메서드 추가(markShipped·markDelivered·getOrderOwnership·getCompletedItemsForSettlement) — additive, 기존 상태머신 정합.
- `apps/backend/src/modules/order/order.repository.ts`: findCompletedItemsBySellerInPeriod 추가.
- `apps/backend/test/static/{cross-schema,schema-decimal}.spec.ts`: 신규 repo 경계·정산 금전 필드 반영.

**검증**: tsc 0 / unit 189 PASS(신규 17 = shipping 11 + settlement 6, 회귀 0) / static 47 PASS / AppModule 부팅 health e2e 3 PASS.

**후속 작업 시 주의사항**:
- **마이그레이션 드리프트**: 005 마이그레이션 SQL에 004(coupons·user_coupons·reviews) 테이블 생성이 함께 포함됨. 004 모델이 schema.prisma엔 있었으나 별도 마이그레이션이 없던 기존 드리프트가 `migrate dev`에서 캡처된 것. DB 정상 동기화 상태이나 백엔드 전체 완료 후 마이그레이션 히스토리 정리 검토 권장.
- 정산 기간 필터가 주문 `createdAt` 기준(전용 `completedAt` 컬럼 부재). 정확한 정산 주기 산정 필요 시 컬럼 추가 검토.
- OrderService에 정산·배송용 공개 메서드가 추가됨. 향후 주문 상태머신 변경 시 이 메서드들의 전이 정합성 재확인 필요.

---

## [004-review-coupon] 구현 완료

**변경 파일**:

### Prisma 스키마

- `apps/backend/prisma/schema.prisma`: commerce 스키마에 3개 enum(CouponIssuerType·CouponType·UserCouponStatus) + 3개 테이블(coupons·user_coupons·reviews) 신규 정의. Coupon(Decimal 금전 필드·issuedCount·totalQuantity), UserCoupon(status·usedOrderId), Review(orderItemId @unique·productId·sellerId·rating·content) 모델. 복합 인덱스(productId+createdAt, userId+createdAt, userId+status, usedOrderId) 추가.

### coupon 모듈 (스텁 → 실구현)

- `apps/backend/src/modules/coupon/coupon.repository.ts`: CouponRepository 실구현. createCoupon·findCouponById·incrementIssuedCountConditional($executeRaw 조건부 increment — issuedCount < totalQuantity)·createUserCoupon·findUserCouponWithCoupon·listUserCoupons·listCouponsByIssuer·markUserCouponUsed(updateMany WHERE status='unused' → count 반환)·restoreUserCouponsByOrder. P-001: commerce 스키마(coupons·user_coupons) 전용.
- `apps/backend/src/modules/coupon/coupon.service.ts`: CouponService 실구현. createCoupon(관리자)·createSellerCoupon(APPROVED 판매자)·issueByAdmin·issueBySeller(소유권 검증)·listMyCoupons·listSellerCoupons·listAdminCoupons·validateAndCalculateDiscount(pre-tx: FR-011 4조건 검증 + FR-012 Decimal 할인 계산)·markUsed(tx 내: 조건부 UPDATE count=0→409, onAfterCommit coupon.used 이벤트)·restoreForOrder(취소 시 쿠폰 복원). SellerService·PrismaService·EventEmitter2 DI.
- `apps/backend/src/modules/coupon/coupon.controller.ts`: AdminCouponController(POST/GET /admin/coupons, POST /admin/coupons/:id/issue — JwtAuthGuard+AdminGuard)·SellerCouponController(POST/GET /sellers/me/coupons, POST /sellers/me/coupons/:id/issue — JwtAuthGuard)·UserCouponController(GET /users/me/coupons — JwtAuthGuard) 구현.
- `apps/backend/src/modules/coupon/coupon.events.ts`: CouponUsedPayload 인터페이스 정의 (5개 필드: userCouponId·couponId·orderId·userId·discountAmount).
- `apps/backend/src/modules/coupon/coupon.module.ts`: AdminCouponController·SellerCouponController·UserCouponController 등록. SellerModule 의존. CouponService export.

### review 모듈 (스텁 → 실구현)

- `apps/backend/src/modules/review/review.repository.ts`: ReviewRepository 실구현. createReview·findReviewById·updateReview·deleteReview·listByProduct(productId cursor 페이지네이션)·listByUser(userId cursor 페이지네이션). P-001: commerce 스키마(reviews) 전용.
- `apps/backend/src/modules/review/review.service.ts`: ReviewService 실구현. createReview(getOrderItemForReview DI→소유권/completed 검증→P2002→409)·updateReview·deleteReview·listProductReviews·listMyReviews. review.created 이벤트 emit (6개 필드). OrderService·EventEmitter2 DI.
- `apps/backend/src/modules/review/review.controller.ts`: ReviewController(POST /reviews, PATCH/DELETE /reviews/:id, GET /reviews/me — JwtAuthGuard)·ProductReviewController(GET /products/:productId/reviews — 인증 불필요) 구현.
- `apps/backend/src/modules/review/review.events.ts`: ReviewCreatedPayload 인터페이스 정의 (6개 필드: reviewId·orderItemId·orderId·productId·userId·rating).
- `apps/backend/src/modules/review/review.module.ts`: ReviewController·ProductReviewController 등록. OrderModule 의존.

### order 모듈 (쿠폰 연동 보정)

- `apps/backend/src/modules/order/dto/create-order.dto.ts`: 선택적 `userCouponId?: string` 필드 추가 (FR-010, SEC-FIND-004: discountAmount 직접 지정 금지 원칙 유지).
- `apps/backend/src/modules/order/order.service.ts`: createOrder에 쿠폰 검증·할인 계산(pre-tx validateAndCalculateDiscount) + tx 내 markUsed 분기 추가. cancel에 restoreForOrder 호출 추가(FR-016). getOrderItemForReview 신규 공개 메서드 추가(review 모듈 DI용). CouponService 생성자 주입.
- `apps/backend/src/modules/order/order.repository.ts`: findOrderItemWithOrder(orderItemId) 신규 메서드 추가 — review 권한 검증용 OrderItem+Order join. OrderItemWithOrder 타입 export.
- `apps/backend/src/modules/order/order.controller.ts`: createOrder 핸들러에 userCouponId 전달.
- `apps/backend/src/modules/order/order.module.ts`: CouponModule import 추가.

### payment 모듈 (할인 적용 보정)

- `apps/backend/src/modules/payment/payment.service.ts`: pay 메서드 청구 금액을 `totalAmount - discountAmount` 로 변경 (FR-015, SEC-FIND-004). discountAmount=0 주문은 동작 동일(003 회귀 없음).

### 테스트

- `apps/backend/src/modules/order/order.service.spec.ts`: SC-012·SC-019·SC-020·SC-021·SC-023 (004 쿠폰 연동) 테스트 추가. CouponService mock 등록.
- `apps/backend/src/modules/payment/payment.service.spec.ts`: SC-022 (할인 적용 시 net charge 검증) 테스트 추가.
- `apps/backend/test/static/auth-required-guards.spec.ts`: SC-052 (coupon·review 컨트롤러 JwtAuthGuard) 정적 검증 추가.
- `apps/backend/test/static/cross-schema.spec.ts`: SC-053·SC-054 (CouponRepository·ReviewRepository 크로스 스키마 금지) 정적 검증 추가.
- `apps/backend/test/static/schema-decimal.spec.ts`: SC-050(004) (쿠폰 금전 필드 discountValue·maxDiscountAmount·minOrderAmount Decimal) 정적 검증 추가.

**후속 작업 시 주의사항**:

- `CouponService.validateAndCalculateDiscount`는 트랜잭션 외부(pre-tx)에서 호출해야 한다. tx 내부에서 호출하면 `this.prisma.tx`가 아직 열리지 않은 상태에서 중첩 BEGIN 시도 위험.
- `CouponService.markUsed`는 `PrismaService.runInTransaction` 내부에서 호출해야 한다. 주문 생성 트랜잭션과 동일 ALS 컨텍스트 내 실행이 이중사용 방지(NFR-002)의 핵심.
- `OrderService.getOrderItemForReview`는 review 모듈이 cross-schema 직접 접근 없이 orderItem 정보를 얻는 유일한 DI 경로다. 이 메서드를 bypass하는 구현은 P-001 위반.
- `payment.service.ts` pay 메서드의 청구 금액이 `totalAmount - discountAmount`로 변경됨. discountAmount=0인 기존 주문은 영향 없으나, 쿠폰 없는 주문의 discountAmount가 Decimal(0)임을 보장해야 한다.
- SC-034 (rating=0/6 → 400): 미테스트 GAP 잔존. DTO `@IsInt @Min(1) @Max(5)` 검증은 구현되어 있으며 ValidationPipe에 의한 동작은 보장되나, 해당 케이스 단위 테스트가 작성되지 않음. 후속 spec에서 추가 권장.
- context.md / infra.md 갱신 필요 (gaps.md GAP-002 참조 — Retrospective Agent 처리 위임).

---

## [003-commerce] 구현 완료

**변경 파일**:

### Prisma 스키마 및 마이그레이션

- `apps/backend/prisma/schema.prisma`: commerce·orders·payments 스키마 7개 테이블 신규 정의. Cart(JSONB items), Order(Decimal totalAmount/discountAmount, shippingAddressSnapshot, deliveredAt), OrderItem(VariantSnapshot JSONB, Decimal unitPrice), OrderEvent(append-only), Payment(Decimal amount, idempotency key), PaymentOutbox, Refund 모델. OrderStatus·ActorType·PaymentStatus enum 추가. InventoryLogType에 RESTORE 추가 (FR-023).
- `apps/backend/prisma/migrations/20260628141551_003_commerce/migration.sql`: commerce·orders·payments 스키마 7테이블 DDL + enum 신규 + 인덱스 9개.

### Prisma shared 모듈

- `apps/backend/src/shared/prisma/prisma.service.ts`: `runInTransaction(fn)` / `tx` getter / `onAfterCommit(fn)` 메서드 추가. ALS(AsyncLocalStorage) 기반 tx-aware 확장. outbox 패턴·cross-schema 단일 트랜잭션 지원 (FR-013, FR-033, P-005).

### pg-boss 인프라 모듈 (신규)

- `apps/backend/src/infrastructure/pgboss/pgboss.module.ts`: `PgBossModule` — PgBoss 싱글톤 제공, 앱 기동 시 초기화. `@Global()` 모듈.
- `apps/backend/src/infrastructure/pgboss/pgboss.service.ts`: `PgBossService` — pg-boss 인스턴스 생명주기(start/stop) 관리, 큐 생성, send/schedule API 제공. `import PgBoss = require('pg-boss')` CommonJS 방식 사용 (ESM default import 런타임 오류 방지).
- `apps/backend/src/infrastructure/pgboss/outbox-relay.ts`: `OutboxRelay` — payment_outbox 테이블 폴링, pg-boss 잡 발행. payment.completed → order confirmed 상태 전이.
- `apps/backend/src/infrastructure/pgboss/auto-confirm-job.ts`: `AutoConfirmJob` — 배송 완료 후 7일 경과 주문 자동 completed 전환 pg-boss 스케줄 잡 (FR-027).
- `apps/backend/src/infrastructure/pgboss/pgboss.constants.ts`: OUTBOX_QUEUE·AUTO_CONFIRM_QUEUE 큐 이름 상수.

### cart 모듈

- `apps/backend/src/modules/cart/cart.service.ts`: addItem(수량 합산), updateItem(수량 0 제거), removeItem, getCart, removeItems(주문 시 장바구니 비움) 구현. JSONB items 배열 관리.
- `apps/backend/src/modules/cart/cart.repository.ts`: commerce.carts 테이블 전용 Prisma 접근. findOrCreate, save, findByUserId.
- `apps/backend/src/modules/cart/cart.controller.ts`: POST/PATCH/DELETE /cart/items, GET /cart 엔드포인트. JwtAuthGuard 적용.
- `apps/backend/src/modules/cart/cart.module.ts`: CartService·CartRepository 등록 및 export.
- `apps/backend/src/modules/cart/cart.types.ts`: CartItem 인터페이스 정의.
- `apps/backend/src/modules/cart/dto/`: add-cart-item.dto.ts, update-cart-item.dto.ts
- `apps/backend/src/modules/cart/cart.service.spec.ts`: CartService unit 테스트 (SC-001~008)

### order 모듈

- `apps/backend/src/modules/order/order.service.ts`: createOrder(재고 확인→차감→주문 생성→장바구니 비움 단일 tx. discountAmount=Decimal(0) 서버 고정 — SEC-FIND-004), listOrders(cursor 페이지네이션), getOrderDetail(403 소유권), cancelOrder(pending/confirmed 취소·completed 결제 환불·재고 복구·동일 tx. 환불 경로: `PaymentService.findPaymentByOrderId(orderId)` 직접 조회 — SEC-FIND-001), sellerConfirmOrder(preparing 전환·sellerId 검증), completeOrder(delivered→completed·403), markConfirmed(outbox relay용 pending→confirmed), autoConfirmDeliveredOrders(delivered→completed + SYSTEM 액터 appendEvent — SEC-FIND-002) 구현.
- `apps/backend/src/modules/order/order.repository.ts`: orders 스키마 전용 접근. createOrder, findById, findByUserId(cursor), findBySellerOrderItems, appendEvent(append-only), updateStatus, findDeliveredBefore.
- `apps/backend/src/modules/order/order.controller.ts`: POST /orders, GET /orders, GET /orders/:id, DELETE /orders/:id, PATCH /orders/:id/confirm, POST /orders/:id/complete 엔드포인트.
- `apps/backend/src/modules/order/seller-order.controller.ts`: GET /sellers/me/orders 엔드포인트 (FR-024).
- `apps/backend/src/modules/order/order.events.ts`: OrderCreated·OrderCancelled·OrderConfirmed 이벤트 상수.
- `apps/backend/src/modules/order/order.module.ts`: OrderService·OrderRepository·SellerOrderController 등록. CartModule·InventoryModule·PaymentModule 의존.
- `apps/backend/src/modules/order/order.constants.ts`: AUTO_CONFIRM_DAYS=7 상수 정의.
- `apps/backend/src/modules/order/dto/create-order.dto.ts`: items(variantId·quantity)·shippingAddress DTO. discountAmount 필드 없음(SEC-FIND-004: 쿠폰 미구현으로 서버 고정).
- `apps/backend/src/modules/order/order.service.spec.ts`: OrderService unit 테스트 (SC-009~032, SC-037). SC-024 SEC-FIND-001 반영: findPaymentByOrderId mock + refund 호출 단언.

### payment 모듈

- `apps/backend/src/modules/payment/payment.service.ts`: processPayment(Idempotency-Key 검증·멱등성·PG stub 호출·outbox 기록 동일 tx), refundPayment(환불·outbox 기록·이중환불 409·동일 tx), findPaymentByOrderId(orderId 기반 결제 조회 — SEC-FIND-001 지원) 구현.
- `apps/backend/src/modules/payment/payment.repository.ts`: payments 스키마 전용 접근. createPayment, findByOrderId, findByIdempotencyKey, updateStatus, createOutbox, createRefund.
- `apps/backend/src/modules/payment/payment.controller.ts`: POST /payments 엔드포인트. Idempotency-Key 헤더 필수 검증 + `isUUID(key, '4')` UUID v4 형식 검증 추가 (SEC-FIND-005: 비-UUID v4 → 400).
- `apps/backend/src/modules/payment/payment.module.ts`: PaymentService·PaymentRepository·StubPaymentGateway 등록 및 export. PaymentRepository exports 포함(OutboxRelay DI 해소).
- `apps/backend/src/modules/payment/payment-gateway.port.ts`: PaymentGatewayPort 인터페이스 정의 (FR-032).
- `apps/backend/src/modules/payment/stub-payment-gateway.ts`: StubPaymentGateway — 항상 성공 반환 stub 구현 (FR-032).
- `apps/backend/src/modules/payment/dto/create-payment.dto.ts`: orderId·idempotencyKey(UUID v4) DTO. amount 필드 없음(SEC-FIND-003: 금액은 서버 측 order.totalAmount 사용).
- `apps/backend/src/modules/payment/payment.service.spec.ts`: PaymentService unit 테스트 (SC-033~041, SC-052)

### inventory 모듈 (SEC-002 수정)

- `apps/backend/src/modules/inventory/inventory.service.ts`: restoreStock(variantId, quantity, orderId) 신규 메서드 추가 (FR-023). stock.changed 이벤트 발행.
- `apps/backend/src/modules/inventory/inventory.controller.ts`: POST /inventory/:variantId/stock-in·GET /inventory/:variantId/stock에 소유권 검증(variantId→Variant.productId→Product.sellerId) 추가. 비소유 판매자 403 반환 (FR-050, FR-051, SEC-002 수정).
- `apps/backend/src/modules/inventory/inventory.repository.ts`: restoreStock 지원 메서드 추가.
- `apps/backend/src/modules/inventory/inventory.module.ts`: ProductRepository export 추가 (소유권 검증용).
- `apps/backend/src/modules/inventory/inventory.service.spec.ts`: restoreStock 단위 테스트 추가.
- `apps/backend/src/modules/inventory/inventory.controller.spec.ts`: SEC-002 소유권 검증 테스트 (SC-042~044) — 타 판매자 403, 본인 판매자 통과.

### product 모듈 (의존성 추가)

- `apps/backend/src/modules/product/product.service.ts`: getVariantWithProduct(variantId)·getVariantSnapshots(variantIds) 메서드 추가 — inventory 소유권 검증 및 주문 스냅샷 지원.
- `apps/backend/src/modules/product/product.repository.ts`: findVariantWithProduct(variantId) 메서드 추가.
- `apps/backend/src/modules/product/product.module.ts`: ProductRepository export 추가.

### 앱 루트

- `apps/backend/src/app.module.ts`: PgBossModule 등록 추가.

### 정적/통합 테스트

- `apps/backend/test/static/auth-required-guards.spec.ts`: CartController·OrderController·SellerOrderController·PaymentController JwtAuthGuard 검증 추가 (SC-007, SC-047).
- `apps/backend/test/static/cross-schema.spec.ts`: commerce·orders·payments 스키마 모듈 크로스 참조 금지 검증 추가 (SC-050).
- `apps/backend/test/static/schema-decimal.spec.ts`: totalAmount·discountAmount·amount·unitPrice Decimal 타입 검증 + unitPrice 주석 라인 false positive 수정 (SC-049).
- `apps/backend/test/auth.e2e-spec.ts`: SC-006 `toHaveLength(2)` → `arrayContaining(['users','refresh_tokens'])` 교체 (002 이후 users 스키마 테이블 수 증가 대응).
- `apps/backend/test/orders.e2e-spec.ts`: POST /orders P95·구조 검증 (SC-045 — integration deferred).
- `apps/backend/test/payments.e2e-spec.ts`: POST /payments P95·구조 검증 (SC-046 — integration deferred).

### 패키지

- `apps/backend/package.json`: pg-boss@^10.4.2 의존성 추가.
- `pnpm-lock.yaml`: pg-boss 락 추가.

**후속 작업 시 주의사항**:

- `pg-boss@^10.4.2` 버전 핀 유지 필수. v11(Node>=22)·v12(ESM·Node>=22.12)은 현재 프로젝트(Node 20.x + CommonJS)와 비호환. Node 업그레이드 없이 pg-boss 업그레이드 금지.
- pg-boss 파일에서 `import PgBoss = require('pg-boss')` CommonJS 방식 유지 필수. `import PgBoss from 'pg-boss'` (ESM default import) 로 변경 시 `onModuleInit`에서 `PgBoss is not a constructor` 런타임 오류 발생.
- pg-boss가 기동 시 `pgboss` 스키마를 PostgreSQL에 자동 생성하므로 DB 사용자에게 스키마 생성 권한(CREATE) 필요. Fly Postgres 운영 사용자 권한 확인 필수.
- `PrismaService.runInTransaction(fn)` — ALS 기반 tx-aware 확장. OrderService·PaymentService에서 cross-entity 단일 트랜잭션 사용 중. 신규 트랜잭션 필요 시 `prisma.runInTransaction(() => { ... })` 패턴 준수.
- `InventoryService.restoreStock(variantId, quantity, orderId)` 신규 인터페이스 추가됨. 주문 취소 플로우에서 반드시 호출.
- SEC-FIND-001: `cancelOrder()` 내 결제 환불 조회는 `PaymentService.findPaymentByOrderId(orderId)` 경유 필수. `order.payments[]` include 방식은 order 스냅샷 의존으로 환불 미처리 위험 있음.
- SEC-FIND-003/004: `CreatePaymentDto.amount`·`CreateOrderDto.discountAmount` 필드 없음(의도적). 금액·할인은 서버 고정값. 쿠폰/부분환불 기능 추가 시 별도 spec 필요 — 클라이언트 입력 허용 전 Security 검토 필수.
- SC-045/046 P95 integration 검증은 docker-compose 환경 + `TEST_JWT_TOKEN`·`TEST_ORDER_ID` 환경변수 설정 후 수동 실행 필요 (coverage.md §deferred 참조).
- context.md / infra.md 갱신 필요 (gaps.md GAP-001·GAP-002 참조 — Retrospective Agent 처리 위임).

---

## [002-catalog] 구현 완료

**변경 파일**:

### Prisma 스키마 및 마이그레이션

- `apps/backend/prisma/schema.prisma`: users 스키마에 User(name·phone 필드 추가)·Seller·Address·Wishlist·ProductView 모델 추가. products 스키마에 Category·Product·ProductImage·ProductVariant·Inventory·InventoryLog 모델 및 SellerStatus·ProductStatus enum 추가. 총 10개 테이블 신규 정의.
- `apps/backend/prisma/migrations/20260628092954_catalog/migration.sql`: users 스키마 신규 4테이블(sellers·addresses·wishlists·product_views) + products 스키마 8개(categories·products·product_images·options·variants·inventory·inventory_logs·SellerStatus enum) DDL. 카테고리 seed 8개 포함(INSERT … ON CONFLICT DO NOTHING).
- `apps/backend/prisma/migrations/migration_lock.toml`: migration lock 코멘트 문구 수정(i.e.→e.g.)

### user 모듈

- `apps/backend/src/modules/user/user.service.ts`: 프로필 조회·수정, 배송지 CRUD·기본지정, 찜(wishlist) 추가·제거·조회, 최근 본 상품 조회(50개 상한) 구현. `UserEvents.PRODUCT_VIEWED` 이벤트 발행.
- `apps/backend/src/modules/user/user.repository.ts`: users 스키마 전용 Prisma CRUD — User·Address·Wishlist·ProductView 테이블 접근 메서드 구현.
- `apps/backend/src/modules/user/user.controller.ts`: GET /users/me, PATCH /users/me, POST/PATCH/DELETE /users/me/addresses, PATCH /users/me/addresses/:id/default, GET/POST/DELETE /users/me/wishlist/:productId, GET /users/me/product-views 엔드포인트 구현.
- `apps/backend/src/modules/user/user.events.ts`: `UserEventsHandler` — `product.viewed` 이벤트 구독, `recordProductView` 호출로 product_views upsert.
- `apps/backend/src/modules/user/user.module.ts`: UserService·UserRepository·UserEventsHandler 등록 및 InventoryService·SellerService export.
- `apps/backend/src/modules/user/user.constants.ts`: `MAX_PRODUCT_VIEWS = 50` 상수 정의.
- `apps/backend/src/modules/user/dto/`: create-address.dto.ts, update-address.dto.ts, update-profile.dto.ts, add-wishlist.dto.ts
- `apps/backend/src/modules/user/user.service.spec.ts`: UserService unit 테스트 (SC-001~010, SC-012)
- `apps/backend/src/modules/user/user.events.spec.ts`: UserEventsHandler unit 테스트 (SC-011)
- `apps/backend/src/modules/user/user.controller.spec.ts`: UserController guard 테스트 (SC-002)

### seller 모듈

- `apps/backend/src/modules/seller/seller.service.ts`: 판매자 등록(PENDING), 프로필 조회·수정, 심사 상태 조회, 판매자 승인·거부 구현.
- `apps/backend/src/modules/seller/seller.repository.ts`: users.sellers 테이블 접근 메서드 구현.
- `apps/backend/src/modules/seller/seller.controller.ts`: POST /sellers/register, GET /sellers/me, PATCH /sellers/me, GET /sellers/me/status, PATCH /sellers/:id/approve·reject 엔드포인트 구현. **approve·reject 에 AdminGuard 적용(SEC-001 수정)** — ADMIN_USER_IDS 미포함 사용자 403 반환.
- `apps/backend/src/modules/seller/seller.module.ts`: SellerService·SellerRepository 등록 및 export.
- `apps/backend/src/modules/seller/dto/`: register-seller.dto.ts, update-seller.dto.ts, reject-seller.dto.ts
- `apps/backend/src/modules/seller/seller.service.spec.ts`: SellerService unit 테스트 (SC-013~018)
- `apps/backend/.env.example`: ADMIN_USER_IDS 환경변수 추가 (SEC-001 AdminGuard 설정용. 콤마구분 user id 목록. 미설정 시 전원 거부).

### product 모듈

- `apps/backend/src/modules/product/product.service.ts`: 카테고리 목록 조회, 상품 등록(DRAFT)·수정·상태전환(publish/deactivate), variant CRUD, 이미지(최대 10개) 추가·삭제, 상품 목록(cursor 페이지네이션·ACTIVE+OOS 필터), 상품 상세, 판매자 전체 상태 목록 구현. InventoryService·EventEmitter2 의존.
- `apps/backend/src/modules/product/product.repository.ts`: products 스키마 전용 Prisma CRUD — Category·Product·ProductVariant·ProductImage 테이블 접근 메서드 구현.
- `apps/backend/src/modules/product/product.controller.ts`: GET /categories, POST/PATCH /products, PATCH /products/:id/publish·deactivate, POST/PATCH/DELETE /products/:id/variants, POST/DELETE /products/:id/images, GET /products, GET /products/:id, GET /sellers/me/products 엔드포인트 구현.
- `apps/backend/src/modules/product/product.events.ts`: `ProductEventsHandler` — `stock.changed` 이벤트 구독, 전체 variant 재고 합계 기반 자동 OUT_OF_STOCK/ACTIVE 전환 처리.
- `apps/backend/src/modules/product/product.module.ts`: ProductService·ProductRepository·ProductEventsHandler·InventoryModule·SellerModule 등록.
- `apps/backend/src/modules/product/product.constants.ts`: `MAX_PRODUCT_IMAGES = 10` 상수 정의.
- `apps/backend/src/modules/product/dto/`: create-product.dto.ts, update-product.dto.ts, create-variant.dto.ts, update-variant.dto.ts, add-image.dto.ts, list-products.dto.ts
- `apps/backend/src/modules/product/product.service.spec.ts`: ProductService unit 테스트 (SC-019~029, SC-032~040)
- `apps/backend/src/modules/product/product.events.spec.ts`: ProductEventsHandler unit 테스트 (SC-030~031)

### inventory 모듈

- `apps/backend/src/modules/inventory/inventory.service.ts`: 재고 초기화(initStock), 입고(stockIn·stock 증가+inventory_logs append), 재고 조회(getStock), checkAvailability(boolean), decreaseStock(CAS 원자적 차감+log append) 구현. stock.changed 이벤트 발행.
- `apps/backend/src/modules/inventory/inventory.repository.ts`: products.inventory·inventory_logs 테이블 접근. appendLog(delta 필드) append-only. update/delete 메서드 없음(SC-043).
- `apps/backend/src/modules/inventory/inventory.controller.ts`: POST /inventory/:variantId/stock-in, GET /inventory/:variantId/stock 엔드포인트 구현.
- `apps/backend/src/modules/inventory/inventory.events.ts`: 이벤트 상수 정의 스텁.
- `apps/backend/src/modules/inventory/inventory.module.ts`: InventoryService·InventoryRepository export.
- `apps/backend/src/modules/inventory/inventory.exception.ts`: `InsufficientStockException` (BadRequestException 서브클래스) 정의.
- `apps/backend/src/modules/inventory/dto/stock-in.dto.ts`: 입고 수량 DTO (@Min(1) 검증)
- `apps/backend/src/modules/inventory/inventory.service.spec.ts`: InventoryService unit 테스트 (SC-041~042, SC-046)

### shared 모듈

- `apps/backend/src/shared/auth/admin.guard.ts`: **SEC-001 수정** — `ADMIN_USER_IDS` 환경변수(콤마구분 user id 목록) 기반 AdminGuard. 미설정 시 전원 거부(fail-closed).
- `apps/backend/src/shared/auth/admin.guard.spec.ts`: AdminGuard SEC-001 회귀 방지 테스트 3건 (비admin→403, admin→pass, ADMIN_USER_IDS 미설정→전원403).
- `apps/backend/src/shared/auth/auth-shared.module.ts`: OptionalJwtAuthGuard 내보내기 추가 (비인증 허용 엔드포인트용).
- `apps/backend/src/shared/auth/optional-jwt-auth.guard.ts`: 토큰 없어도 통과, 있으면 검증 후 user 주입하는 guard 구현.

### 정적 테스트 및 integration 테스트

- `apps/backend/test/static/inventory-log-append-only.spec.ts`: SC-043 — InventoryRepository에 log update/delete 메서드 없음 정적 검증
- `apps/backend/test/static/inventory-service-signature.spec.ts`: SC-044~045 — checkAvailability·decreaseStock 시그니처 정적 검증
- `apps/backend/test/static/auth-required-guards.spec.ts`: SC-048 — 인증 필수 엔드포인트 JwtAuthGuard 메타데이터 정적 검증
- `apps/backend/test/static/cross-schema.spec.ts`: SC-049 — 모듈별 타 스키마 Prisma 모델 직접 참조 금지 정적 검증
- `apps/backend/test/static/schema-decimal.spec.ts`: SC-050 — schema.prisma price 필드 Decimal 타입 정적 검증
- `apps/backend/test/static/package-no-aws.spec.ts`: SC-051 — @aws-sdk/* 신규 의존 없음 정적 검증
- `apps/backend/test/products.e2e-spec.ts`: SC-047 — GET /products P95≤500ms integration 검증 (실측 P95=3ms)

**후속 작업 시 주의사항**:

- `InventoryService.decreaseStock`은 호출자의 트랜잭션 컨텍스트 내에서 실행됨을 전제로 설계됨(FR-034). 003-commerce에서 order 생성 트랜잭션 내에서 호출해야 원자성이 보장됨.
- `ProductEventsHandler.handleStockChanged({productId, totalStock})` 이벤트 페이로드 형식은 inventory 모듈이 발행, product 모듈이 구독. 003에서 재고 차감 후 동일 이벤트를 발행해야 OUT_OF_STOCK 자동 전환이 작동함.
- `OptionalJwtAuthGuard`: 비인증 사용자도 허용하는 엔드포인트(GET /products, GET /products/:id, GET /categories)에 사용. product.viewed 이벤트는 인증된 사용자에 한해 발행됨(service 내 user 존재 여부 체크).
- **SEC-001 수정 완료**: seller 승인/거부 API에 `AdminGuard` 적용. `ADMIN_USER_IDS` 환경변수(콤마구분 user id) 기반 fail-closed 제어. 프로덕션 배포 전 `apps/backend/.env.example` 를 참고하여 ADMIN_USER_IDS 설정 필수. 미설정 시 승인/거부 전면 차단.
- context.md / infra.md 갱신 필요 (gaps.md GAP-002·GAP-003 참조 — Retrospective Agent 처리 위임).

---

## [001-skeleton-bootstrap] 구현 완료

**변경 파일**:

### 모노레포 루트

- `.gitignore`: Node.js / pnpm / Turborepo / 환경파일 gitignore 규칙
- `.npmrc`: shamefully-hoist=false, strict-peer-dependencies=false 설정
- `.dockerignore`: node_modules·dist·.env·.git 제외 규칙
- `.env.example`: DATABASE_URL / JWT_ACCESS_SECRET / JWT_REFRESH_SECRET 템플릿
- `package.json`: Turborepo 루트 워크스페이스 패키지 정의 (pnpm workspace)
- `pnpm-workspace.yaml`: apps/* / packages/* 워크스페이스 선언
- `turbo.json`: lint·typecheck·build·test 태스크 파이프라인 정의
- `tsconfig.json`: 루트 TypeScript 기본 설정
- `eslint.config.mjs`: ESLint 9 플랫 설정 (NestJS + TypeScript)
- `docker-compose.yml`: 로컬 개발용 PostgreSQL 16 컨테이너 설정

### GitHub Actions CI

- `.github/workflows/ci.yml`: lint → typecheck → test → docker-build 4단계 파이프라인. needs chain으로 단계 실패 시 후속 차단.

### apps/backend — NestJS 앱

- `apps/backend/package.json`: NestJS 11, Prisma, bcrypt, passport-jwt, pino 의존성 정의
- `apps/backend/nest-cli.json`: NestJS CLI 설정
- `apps/backend/tsconfig.json` / `tsconfig.build.json`: TypeScript 컴파일 설정
- `apps/backend/Dockerfile`: 멀티스테이지 빌드 (deps / build / prod). prisma generate 포함.
- `apps/backend/prisma/schema.prisma`: multiSchema(8개: users·products·commerce·orders·payments·settlements·admin·files), User·RefreshToken 모델(users 스키마)
- `apps/backend/prisma/migrations/20260628000000_init/migration.sql`: 8개 CREATE SCHEMA IF NOT EXISTS + users.users + users.refresh_tokens + 인덱스 2개 + FK
- `apps/backend/prisma/migrations/migration_lock.toml`: Prisma 마이그레이션 락 파일

#### 진입점 및 공통

- `apps/backend/src/main.ts`: NestJS 부트스트랩, pino 로거 통합, 3000번 포트 리스닝
- `apps/backend/src/app.module.ts`: ConfigModule·PrismaModule·EventEmitterModule·AuthSharedModule + 18개 도메인 모듈 등록

#### health 모듈

- `apps/backend/src/health/health.controller.ts`: GET /health → 200 `{status:"ok"}`
- `apps/backend/src/health/health.module.ts`: HealthController 등록

#### auth 모듈 (실구현)

- `apps/backend/src/modules/auth/auth.service.ts`: register / login(bcrypt cost 10) / refresh / logout / getProfile 구현. JWT_ACCESS_TTL_SECONDS=900 / JWT_REFRESH_TTL_DAYS=30. refreshToken SHA-256 해시 저장.
- `apps/backend/src/modules/auth/auth.controller.ts`: POST /auth/register·login·refresh·logout, GET /auth/me 엔드포인트. logout에 JwtAuthGuard 미적용(SC-018 수정).
- `apps/backend/src/modules/auth/auth.repository.ts`: Prisma 기반 user·refreshToken CRUD (users 스키마)
- `apps/backend/src/modules/auth/auth.module.ts`: AuthService·AuthRepository·JwtModule 조합
- `apps/backend/src/modules/auth/auth.events.ts`: 도메인 이벤트 스텁
- `apps/backend/src/modules/auth/dto/register.dto.ts` / `login.dto.ts` / `refresh.dto.ts`: 입력 DTO

#### shared 모듈 (공통 인프라)

- `apps/backend/src/shared/auth/jwt.strategy.ts`: PassportStrategy 기반 JWT 검증. jwtConfig 네임스페이스 키 사용.
- `apps/backend/src/shared/auth/jwt-auth.guard.ts`: AuthGuard('jwt') 래퍼
- `apps/backend/src/shared/auth/current-user.decorator.ts`: @CurrentUser() 파라미터 데코레이터
- `apps/backend/src/shared/auth/auth-shared.module.ts`: JwtStrategy·PassportModule 공유 모듈
- `apps/backend/src/shared/config/jwt.config.ts`: jwtConfig registerAs('jwt'). JWT_ACCESS_TTL_SECONDS=900 / JWT_REFRESH_TTL_DAYS=30 상수 정의.
- `apps/backend/src/shared/config/config.module.ts`: ConfigModule 래퍼
- `apps/backend/src/shared/prisma/prisma.service.ts`: PrismaClient 확장, onModuleInit/onModuleDestroy 라이프사이클
- `apps/backend/src/shared/prisma/prisma.module.ts`: PrismaService 전역 제공

#### 도메인 스텁 모듈 17개 (각 5파일)

- `apps/backend/src/modules/{user|seller|product|inventory|cart|coupon|order|payment|shipping|settlement|review|search|notification|file|banner|stats|admin}/`: 각각 controller·service·repository·events·module 빈 스텁 파일

### apps/backend 테스트

- `apps/backend/src/modules/auth/auth.service.spec.ts`: unit 8건. SC-010(중복 이메일 409) / SC-013(잘못된 이메일 401) / SC-014(잘못된 비밀번호 401) / SC-016(만료 refresh 401) / SC-017(revoked refresh 401) + Access Token exp 검증.
- `apps/backend/src/shared/auth/jwt-auth.guard.spec.ts`: unit 4건. SC-020(토큰 부재 401) / SC-021(만료 access 401). ConfigService mock 키 `'jwt.accessSecret'` 로 수정됨(B-1 정정).
- `apps/backend/test/static/structure.spec.ts`: static 4건. SC-001(모노레포 구조) / SC-003(NestJS 앱 골격) / SC-004(schema.prisma) / SC-005(18개 도메인 모듈).
- `apps/backend/test/static/ci-workflow.spec.ts`: static 5건. SC-022~026 CI 워크플로우 needs chain 정적 검증.
- `apps/backend/test/health.e2e-spec.ts`: integration 3건. SC-002(앱 기동) / SC-007(GET /health 200) / SC-008(P95≤200ms).
- `apps/backend/test/auth.e2e-spec.ts`: integration 8건. SC-006/009/011/012/015/018/019/027 전체 검증.
- `apps/backend/test/jest-e2e.json`: e2e 테스트 Jest 설정. setupFiles: setup-env.js.
- `apps/backend/test/setup-env.js`: NODE_ENV=production 강제 설정 (pino-pretty 없이 e2e 실행; B-2 정정).

### apps/console / apps/worker / packages

- `apps/console/package.json` / `README.md`: 플레이스홀더 초기화 (Stage 4 대상)
- `apps/worker/package.json` / `README.md`: 플레이스홀더 초기화 (Stage 2+ 대상)
- `packages/shared-types/`, `packages/api-client/`, `packages/ui/`: 각각 package.json + src/index.ts 플레이스홀더

### .claude (프로젝트 AI 설정)

- `.claude/docs/constitution.md`: 7개 불변 원칙 (성능·호환성·테스트·스펙범위·보안·비용·점진 이전)
- `.claude/docs/context.md`: 프로젝트 구조·도메인 모델·용어사전 초안 (v1.0.0 골격 구축 전 기준)
- `.claude/docs/infra.md`: 인프라 토폴로지·배포 방식·환경 구성 초안

**후속 작업 시 주의사항**:

- `pino-pretty`가 devDependencies에 없다. 로컬 개발 환경에서 pretty 로그를 사용하려면 `pnpm add -D pino-pretty --filter backend` 실행 필요. e2e 테스트는 현재 `NODE_ENV=production`(JSON 로그)으로 우회 중. (test-report.md B-2 참조)
- bcrypt cost가 10으로 확정됨(GAP-003: cost 12에서 P95=859ms 위반). 향후 하드웨어 업그레이드 시 재평가 가능하나 NFR-002(500ms) 기준 준수 필수.
- `auth` 모듈 logout 엔드포인트에 JwtAuthGuard가 없음(의도적). access token 없이 refreshToken만으로 호출 가능. (GAP-002, plan.md 인터페이스 계약 기준)
- 17개 비-auth 도메인 모듈은 빈 스텁 상태. 실구현 시 해당 모듈의 Prisma 스키마 마이그레이션이 선행되어야 함.
- context.md / infra.md가 골격 구축 이전 기획 기준으로 작성됨. 실제 구현 내용으로 갱신 필요 (gaps.md GAP-004·GAP-005 참조).
