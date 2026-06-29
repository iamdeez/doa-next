---
작성: Design Agent → Security Agent → Docs Agent 누적
버전: v1.0
최종 수정: 2026-06-29 17:50
상태: 확정 (retroactive)
---

# Gaps — 006-search-notification-file

> 기획/설계 공백 누적 기록. 3단계 이후 모든 Agent 가 누적.

## 목차

- [GAP-006-01](#gap-006-01)
- [GAP-006-02](#gap-006-02)
- [GAP-006-03 (SEC-FIND-006-01 교차기재)](#gap-006-03-sec-find-006-01-교차기재)
- [GAP-006-04 (SEC-FIND-006-02 교차기재)](#gap-006-04-sec-find-006-02-교차기재)

---

## GAP-006-01

- **출처**: Design Agent / Test Agent (coverage-gap)
- **유형**: 기능 공백 (Low) — 알림 도메인 이벤트 미연동
- **컨텍스트**: `notification.service.ts` `create()`, `notification.module.ts` exports, `NotificationType` enum
- **내용**: `NotificationService.create()` 가 공개 진입점으로 export 되었으나, 주문·배송·정산·리뷰 이벤트 핸들러에서 호출하는 연동이 미구현이다. `NotificationType` enum 에 도메인 이벤트 종류(`ORDER_PLACED`·`ORDER_SHIPPED`·`SETTLEMENT_CREATED`·`REVIEW_RECEIVED`)를 열거했으나 실제 호출 측은 0(grep 결과 notification 모듈 자체 테스트만 호출). 따라서 알림이 실제로 생성되는 경로가 없으며(공개 진입점만 제공) 이벤트→알림→조회 통합 시나리오는 미검증이다.
- **수정 방향**: order/shipping/settlement/review 이벤트 핸들러(또는 서비스)에서 `NotificationService.create()` 호출 연동 + 통합 시나리오 테스트 추가.
- **영향**: 낮음 — 기능 공백(설계상 진입점 우선 제공, 이벤트 연동 후속 분리). 보안 영향 없음.
- **상태**: **RESOLVED (009-notification-events, 커밋 b3793fa)** — `NotificationEventsHandler`(@OnEvent 4종)가 order.created·shipping.shipped·settlement.created·review.created 를 구독하여 알림 생성. NotificationType 4종 전부 실제 생성 경로 확보. 수신자 해석 read-only Service DI(P-001), 실패 격리(safeNotify). 통합 시나리오 e2e 는 후속 보강 권고로 남김(009 coverage-gap.md). 해결 검증 상세는 `docs/specs/v1.0.0/009-notification-events/` 참조.

## GAP-006-02

- **출처**: Design Agent / Test Agent (coverage-gap)
- **유형**: 기능 공백 (Low) — 파일 PENDING→UPLOADED 확정(confirm) 부재
- **컨텍스트**: `file.service.ts`(presign·getById·delete 만), `schema.prisma` `FileAsset.status`/`size`
- **내용**: presign 시 생성되는 `FileAsset` 은 항상 `status=PENDING`·`size=0` 이며, 이를 `UPLOADED` 로 전이하거나 실제 size 를 기록하는 엔드포인트·메서드가 없다. 클라이언트가 presigned URL 로 직접 PUT 한 후 서버에 업로드 완료를 알릴 경로가 없어 고아 PENDING 레코드가 누적될 수 있다.
- **수정 방향**: `POST /files/:id/confirm`(또는 스토리지 콜백)으로 `PENDING → UPLOADED` 전이 + size 기록. 고아 PENDING 정리 정책(TTL 배치) 검토.
- **영향**: 낮음 — 운영상 PENDING 정리로 완화 가능. 본 spec 범위 외.
- **상태**: OPEN — 후속 spec 위임.

## GAP-006-03 (SEC-FIND-006-01 교차기재)

- **출처**: Security Agent (SEC-FIND-006-01)
- **유형**: 보안 취약점 (Low) — `GET /files/:id` 소유권 미검증
- **컨텍스트**: `file.service.ts` `getById()`, `file.controller.ts` `GET /files/:id`
- **내용**: `GET /files/:id` 가 소유권/인가 검증 없이 임의 인증 사용자에게 파일 메타(`key`·`url`·`ownerId`·`contentType`)를 노출한다. `JwtAuthGuard` 만 적용되어 인증된 사용자라면 타인 소유 파일의 메타를 조회할 수 있다.
- **수정 방향**: 비공개 purpose 도입 시 `getById` 에 `file.ownerId === userId` 검증 추가 또는 공개/비공개 구분(공개 purpose 만 무인가 메타 허용).
- **영향**: 낮음 — 현재 모든 파일이 public URL 모델이라 메타 노출과 정합. 비공개 purpose 도입 시 정보 노출 위험. OWASP A01.
- **상태**: OPEN — security-report.md SEC-FIND-006-01 과 동일 사안. 후속 spec 위임.

## GAP-006-04 (SEC-FIND-006-02 교차기재)

- **출처**: Security Agent (SEC-FIND-006-02)
- **유형**: 보안 취약점 (Low) — presign 입력 무검증
- **컨텍스트**: `file.service.ts` `presign()`, `file/dto/presign.dto.ts`
- **내용**: presign 이 클라이언트 `contentType` 을 무검증 수용한다(허용 MIME allowlist 부재). 파일 크기 상한이 적용되지 않으며 `size=0` placeholder 로 레코드를 생성한다. 실제 R2 presign 전환 시 임의 content-type·과대 파일 업로드 표면이 된다.
- **수정 방향**: 실제 R2 전환 시 (1) contentType allowlist 검증, (2) presigned URL 에 content-type·크기 제한 바인딩, (3) 비허용 입력 거부.
- **영향**: 낮음 — 현재 stub 모델(무네트워크, 실제 업로드 미발생)에서 표면 제한적. 실제 R2 전환 시 처리 필요. OWASP A04.
- **상태**: OPEN — security-report.md SEC-FIND-006-02 와 동일 사안. 실제 R2 전환 spec 위임.
