---
작성: Test Agent (EXECUTION)
버전: v1.0
최종 수정: 2026-06-29 17:50
상태: 확정 (retroactive)
---

# Coverage Gap: 006-search-notification-file

## 목차

- [미커버 항목 목록](#미커버-항목-목록)
- [알림 도메인 이벤트 미연동 (상세)](#알림-도메인-이벤트-미연동-상세)
- [파일 PENDING→UPLOADED 확정 부재 (상세)](#파일-pendinguploaded-확정-부재-상세)
- [GET /files/:id 소유권 미검증 (상세)](#get-filesid-소유권-미검증-상세)
- [presign 입력 무검증 (상세)](#presign-입력-무검증-상세)
- [신규 단위 테스트 수 기록](#신규-단위-테스트-수-기록)

---

## 미커버 항목 목록

> 모든 spec.md SC(SC-001~011, SC-053)는 직접 커버(PASS). 아래는 SC 로 정의되지 않았거나 production
> 기능 부재로 테스트 대상이 없는 공백이다.

| 항목 | 미커버 시나리오 | 카테고리 | 검증 방법 | 담당 | 비고 |
|---|---|---|---|---|---|
| 알림 도메인 이벤트 연동 | 주문·배송·정산·리뷰 이벤트 → `create()` → 사용자 조회 통합 흐름 | (3) 기능 미구현 | 후속 spec: 이벤트 핸들러 연동 + 통합 시나리오 테스트 | 후속 spec | **RESOLVED — 009-notification-events 에서 해결**(GAP-006-01). `NotificationEventsHandler`(@OnEvent 4종)가 이벤트 구독→알림 생성. 단, 이벤트→DB→조회 end-to-end 통합 테스트는 009 에서도 후속 보강 권고로 남김(009 coverage-gap.md) |
| 파일 PENDING→UPLOADED 확정(confirm) | 업로드 후 상태 전이·size 기록 | (3) 기능 미구현 | 후속 spec: confirm 엔드포인트 + 상태 전이 테스트 | 후속 spec | Low (GAP-006-02) |
| `GET /files/:id` 소유권 검증 | 비공개 파일 메타 타인 노출 차단 | (3) 기능 미구현 | 비공개 purpose 도입 시 ownerId 검증 + 403 테스트 | 후속 spec | Low (SEC-FIND-006-01) |
| presign contentType allowlist·크기 상한 | 비허용 MIME·과대 크기 업로드 거부 | (3) 기능 미구현 | 실제 R2 전환 시 content-type 바인딩·크기 제한 + 거부 테스트 | 후속 spec | Low (SEC-FIND-006-02) |
| `ProductService/Repository.searchProducts` 직접 단위 테스트 | 상태 필터(ACTIVE·OUT_OF_STOCK)·정렬(price/createdAt + id desc)·Decimal 가격 범위 직접 검증 | (1) 단위테스트 가능 | product.service.spec/e2e 에 검색 질의 직접 테스트 추가 | 개발 | search.service.spec mock 호출 단언 + e2e 부팅(200)으로 간접 커버 |

> 카테고리 (1) 항목이 1건 — ProductService/Repository.searchProducts 직접 테스트. 검색 질의 자체(상태
> 필터·정렬·가격)는 e2e 부팅(200·page meta)으로 간접 확인되며 기능 결함 위험은 낮으나, 질의 분기의
> 직접 단위 검증은 후속 보강 권장.

---

## 알림 도메인 이벤트 미연동 (상세)

> **RESOLVED — 009-notification-events(커밋 b3793fa)에서 해결.** 아래 현상·근본 원인은 006 시점 기준
> 기록이며, 009 가 `NotificationEventsHandler`(@OnEvent 4종)로 이벤트 구독→알림 생성을 구현하여 해소했다.
> 단, 이벤트→DB 알림 생성→조회 end-to-end 통합 시나리오 테스트는 009 에서도 후속 보강 권고로 남아 있다
> (009 coverage-gap.md). 상세는 `docs/specs/v1.0.0/009-notification-events/` 참조.

**현상**(006 시점): `NotificationService.create()` 가 export 되었으나 실제로 호출하는 도메인 이벤트 핸들러가 없다.

**근본 원인 (코드 근거)**:
1. `NotificationModule` 이 `NotificationService` 를 `exports` 하고, `NotificationType` enum 에 도메인
   이벤트 종류(`ORDER_PLACED`·`ORDER_SHIPPED`·`SETTLEMENT_CREATED`·`REVIEW_RECEIVED`)를 열거했다.
2. 그러나 order·shipping·settlement·review 모듈 중 `NotificationService.create()` 를 DI 로 호출하는
   코드가 **없다**(grep 결과 호출 측 0 — notification 모듈 자체 테스트만 호출).

따라서 현재 알림이 실제로 생성되는 경로가 없으며(공개 진입점만 제공), 이벤트→알림→조회 통합 시나리오는
검증할 production 흐름 자체가 부재하다.

**위험도**: Low. 기능 공백(설계상 진입점 우선 제공, 이벤트 연동 후속 분리).

**미커버**: 실제 알림 생성 경로가 없으므로 통합 시나리오 테스트도 없다(기능 미구현).

**권장 수정 방향 (후속 spec)**:
1. order/shipping/settlement/review 이벤트 핸들러(또는 서비스)에서 `NotificationService.create()` 호출
   연동.
2. 이벤트 발생 → 알림 생성 → `GET /notifications` 조회 통합 시나리오 테스트 추가.

> 본 항목은 gaps.md GAP-006-01 과 동일 사안이다.

---

## 파일 PENDING→UPLOADED 확정 부재 (상세)

**현상**: presign 시 생성되는 `FileAsset` 은 항상 `status=PENDING`·`size=0` 이며, 이를 `UPLOADED` 로
전이하거나 실제 size 를 기록하는 경로가 없다.

**근본 원인 (코드 근거)**:
- `FileService` 에 `presign`·`getById`·`delete` 만 존재하고 `confirm`/`markUploaded` 류 메서드·엔드포인트가
  없다.
- 클라이언트가 presigned URL 로 직접 PUT 한 후 서버에 업로드 완료를 알릴 경로가 없어, 고아 `PENDING`
  레코드가 누적될 수 있다.

**위험도**: Low. 운영상 PENDING 레코드 정리(배치 등)로 완화 가능하나 본 spec 범위 외.

**미커버**: 상태 전이·size 갱신 production 로직이 없으므로 검증 테스트도 없다(기능 미구현).

**권장 수정 방향 (후속 spec)**:
1. `POST /files/:id/confirm`(또는 콜백) 으로 `PENDING → UPLOADED` 전이 + size 기록.
2. 고아 PENDING 정리 정책(TTL 기반 배치 등) 검토.

> 본 항목은 gaps.md GAP-006-02 와 동일 사안이다.

---

## GET /files/:id 소유권 미검증 (상세)

**현상**: `FileService.getById(id)` 가 `findById` 후 소유권 검증 없이 메타(`key`·`url`·`ownerId`·
`contentType` 등)를 반환한다. `FileController.getById` 는 `JwtAuthGuard` 만 적용되어 임의 인증 사용자가
타인 파일 메타를 조회할 수 있다.

**위험도**: Low. 현재 모든 파일이 public URL 모델(`publicUrl` 반환)이라 메타 노출과 정합하나, 비공개
purpose 도입 시 메타 스코핑 부재가 정보 노출로 이어질 수 있다.

**미커버**: 소유권 검증 production 로직 자체가 없으므로 403 단언 테스트도 없다.

**권장 수정 방향**: 비공개 purpose 도입 시 `getById` 에 `ownerId === userId` 검증 또는 공개/비공개 구분.

> 본 항목은 security-report.md SEC-FIND-006-01 및 gaps.md 교차 기재와 동일 사안이다.

---

## presign 입력 무검증 (상세)

**현상**: `PresignDto` 가 `purpose`(@IsEnum)·`contentType`(@IsString)만 검증하고, contentType 허용
MIME allowlist 와 파일 크기 상한이 없다. `presign` 은 `size: 0` placeholder 로 레코드를 생성한다.

**위험도**: Low. 현재 stub 모델(무네트워크, 실제 업로드 미발생)에서는 악용 표면이 제한적이나, 실제 R2
presign 전환 시 임의 content-type·과대 파일 업로드 표면이 된다.

**미커버**: allowlist·크기 제한 production 로직이 없으므로 거부 테스트도 없다.

**권장 수정 방향**: 실제 R2 전환 시 (1) contentType allowlist 검증, (2) presigned URL 에 content-type·
크기 제한 바인딩, (3) 비허용 입력 거부 테스트.

> 본 항목은 security-report.md SEC-FIND-006-02 와 동일 사안이다.

---

## 신규 단위 테스트 수 기록

006 신규 단위 테스트는 **20건**이며, 실제 spec 파일의 `it()` 를 직접 카운트하여 확정했다(자가 보고
신뢰하지 않음):

| 파일 | 케이스 수 | 구성 |
|---|---|---|
| `search.service.spec.ts` | 5 | defaults·skip·clamp·filters passthrough·meta wrap |
| `notification.service.spec.ts` | 8 | create 1 + list 3 + markRead 3 + markAllRead 1 |
| `file.service.spec.ts` | 7 | presign 2 + getById 2 + delete 3 |
| **합계** | **20** | 005 baseline 189 + 20 = 209 unit (정합) |

추가로 통합 부팅 `search-notification-file.e2e-spec.ts` 4건(search 2 + notification 1 + file 1),
정적 `cross-schema.spec.ts` 에 NotificationRepository(006)·FileRepository(006) 규칙 2건을 확장했다. 본
카운트는 추적 정확성 목적이며 기능 커버리지에는 영향 없다.
