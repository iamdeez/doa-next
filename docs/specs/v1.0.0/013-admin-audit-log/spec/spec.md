---
작성: Spec Agent
버전: v1.0
최종 수정: 2026-06-29 21:19
상태: 확정 (구현 완료 — retroactive 문서화)
---

# Spec: 013-admin-audit-log

> Branch: 013-admin-audit-log | Date: 2026-06-29 | Version: v1.0.0
>
> 본 문서는 이미 구현·검증이 완료된 코드(커밋 `b8b45aa`, base `1af0fa6`)를 근거로 정식 SDD 포맷으로
> retroactive 작성되었다. 모든 요구사항·수용 기준은 실제 구현된 `admin` 모듈의 감사 로그 코드
> (`AdminAuditLog` 모델·마이그레이션 013·`AdminRepository.createAuditLog`/`listAuditLogs`·`AdminService.
> approveSeller`(시그니처 변경)+감사 기록·`AdminService.listAuditLogs`·`GET /admin/audit-logs`·`admin.
> constants` 상수)와 단위 테스트(`admin.service.spec.ts` +2)에서 확인한 사실을 기준으로 한다.

## 목차

- [배경 및 목적](#배경-및-목적)
- [선행 spec 영향 추적](#선행-spec-영향-추적)
- [사용자 스토리](#사용자-스토리)
- [기능 요구사항](#기능-요구사항)
- [비기능 요구사항](#비기능-요구사항)
- [수용 기준](#수용-기준)
- [요구사항 구조화 매트릭스](#요구사항-구조화-매트릭스)
- [해결된 선행 설계 공백](#해결된-선행-설계-공백)
- [범위 외](#범위-외)
- [미결 사항](#미결-사항)

---

## 배경 및 목적

007-banner-stats-admin 의 설계·보안 단계에서 관리자 액션 추적성(거버넌스) 공백이 식별되었다
(GAP-007-01, Low).

- **GAP-007-01 (운영 추적 공백 — 관리자 액션 audit log 미도입)**: admin 모듈이 판매자 승인
  (`approveSeller`) 등 관리자 조치를 수행하지만, 누가·언제·어떤 조치를 했는지 기록하는 append-only
  감사 로그 테이블이 없었다. `AdminRepository` 는 자체 테이블이 없는 **빈 클래스**(007 ADR-004)였고,
  관리자 조치가 도메인 Service 호출(`SellerService.approve`)로만 수행되어 audit trail 이 남지 않았다.
  보안 사고가 아니라 다수 관리자 운영 시 책임 추적(거버넌스)을 위한 운영 추적성 공백으로, 007 시점에는
  `admin` 스키마에 자체 테이블이 없어 OPEN 으로 후속 spec 에 위임되었다.

013 은 이 공백을 **admin 스키마에 `admin_audit_logs`(append-only) 테이블을 추가하고, 관리자 조치 시
감사 로그를 기록하며, 관리자 전용 조회 엔드포인트를 노출**하여 해소한다. admin 모듈이 처음으로 자기
소유 테이블을 보유하게 되며(`AdminRepository` 가 빈 클래스 → 실 repository), 현재 감사 대상은 판매자
승인(`SELLER_APPROVE`) 1종이다. 승인을 수행한 관리자의 userId(`adminId`)·조치 종류(`action`)·대상 종류
(`targetType`)·대상 식별자(`targetId`)·기록 시각(`createdAt`)을 append-only 로 기록하고, `GET
/admin/audit-logs`(AdminGuard)로 최신순 조회한다.

> 단순화 결정: `action`·`targetType` 은 enum 이 아닌 `String` 으로 저장하여(확장성 — 향후 BANNER·USER
> 등 대상 추가 시 마이그레이션 없이 수용) 상수(`AUDIT_ACTION`·`AUDIT_TARGET`)로 값을 관리한다. 감사
> 기록은 승인 성공 후 append 하여(기록 순서) 기록 실패가 승인 자체를 롤백하지 않는다 — 단 현재
> 구현은 try/catch·`$transaction` 미적용이라 기록 실패 시 예외가 호출 측으로 전파된다(트랜잭션
> 원자성 아님 — 의도적 단순화, 후속 격리/트랜잭션 검토 가능).

---

## 선행 spec 영향 추적

| 선행 spec | 식별된 연동 항목 | 인지 시점 | 식별 경로 |
|---|---|---|---|
| v1.0.0/007-banner-stats-admin | 관리자 액션 audit log 부재(GAP-007-01, Low — `AdminRepository` 빈 클래스, 관리자 조치 audit trail 없음). 013 이 `admin_audit_logs`(append-only) 추가 + 판매자 승인 감사 기록 + `GET /admin/audit-logs` 조회로 부분 해결(감사 대상 = 판매자 승인 1종). | 2026-06-29 | admin.service.ts `approveSeller`·admin.repository.ts(빈 클래스)·security-report.md A09 |

---

## 사용자 스토리

- **US-001**: 플랫폼 운영자로서, 관리자가 수행한 조치(현재: 판매자 승인)가 누가·언제·무엇을 대상으로
  했는지 append-only 로 기록되어, 다수 관리자 운영 시 책임 추적(거버넌스)이 가능하기를 원한다.
- **US-002**: 감사자(운영 관리자)로서, 관리자 조치 감사 로그를 최신순으로 조회하여(관리자 전용)
  최근 운영 조치 이력을 확인하기를 원한다.

---

## 기능 요구사항

- **FR-001**: `admin` 스키마에 append-only 감사 로그 테이블 `admin_audit_logs`(Prisma 모델
  `AdminAuditLog`)를 추가한다 — `id`(cuid PK)·`adminId`·`action`·`targetType`·`targetId`·`createdAt`
  (`@default(now())`). 인덱스 `(createdAt desc)`·`(adminId, createdAt desc)`. UPDATE/DELETE 미제공
  (append-only).

- **FR-002**: `AdminRepository`(007 의 빈 클래스)에 `createAuditLog({ adminId, action, targetType,
  targetId })`(append-only 1건 기록)와 `listAuditLogs(take)`(최신순 take 개 조회)를 추가하여, admin
  모듈이 자기 소유 테이블(`admin_audit_logs`)에 접근하게 한다. 타 도메인 데이터는 여전히 Seller/User
  Service DI 경유(P-001 경계 유지 — admin 스키마 외 모델 직접 참조 0).

- **FR-003**: 관리자 판매자 승인 `AdminService.approveSeller(adminUserId, sellerId)`(시그니처 변경 —
  기존 `approveSeller(sellerId)` 에 승인 수행 관리자 userId 인자 추가)가 `SellerService.approve` 승인
  성공 후 `createAuditLog({ adminId: adminUserId, action: AUDIT_ACTION.SELLER_APPROVE, targetType:
  AUDIT_TARGET.SELLER, targetId: sellerId })` 로 감사 로그를 append 한다. `AdminController.approveSeller`
  가 `@CurrentUser().userId` 를 `adminUserId` 로 전달한다.

- **FR-004**: 관리자 전용 감사 로그 조회 엔드포인트 `GET /admin/audit-logs`(`JwtAuthGuard`+`AdminGuard`)를
  추가한다. `AdminService.listAuditLogs(limit)` 가 `limit` 을 `1..MAX_AUDIT_LOG_LIMIT(200)` 범위로
  클램프(`limit` 미지정 시 `DEFAULT_AUDIT_LOG_LIMIT(50)`)하여 `AdminRepository.listAuditLogs(take)` 를
  호출, 최신순 목록을 반환한다.

---

## 비기능 요구사항

- **NFR-001** (모듈 경계 / P-001): `AdminRepository` 는 admin 스키마 자기 소유 테이블(`admin_audit_logs`)
  만 접근한다. 타 스키마 모델(users·sellers·orders·payments·products) 직접 참조 0(cross-schema 정적
  검증 — `cross-schema.spec.ts` AdminRepository 규칙). 판매자 승인·사용자 조회 등 타 도메인 데이터는
  Seller/User Service DI 경유 유지.

- **NFR-002** (책임 추적 / 거버넌스): 관리자 조치(현재 판매자 승인)는 수행 관리자 userId(`adminId`)와
  함께 append-only 로 기록되어 사후 책임 추적이 가능하다. 감사 로그는 UPDATE/DELETE 메서드를 제공하지
  않아(repository 가 create·findMany 만 노출) 위변조 표면을 줄인다.

- **NFR-003** (인증·인가): 감사 로그 조회(`GET /admin/audit-logs`)는 `JwtAuthGuard`+`AdminGuard`
  (fail-closed)로 보호되어 비인증 401·비관리자 403 이다. `adminId` 는 클라이언트 입력이 아닌 서버가
  `@CurrentUser().userId` 로 확정한 승인 수행 관리자다(위조 표면 부재).

- **NFR-004** (호환성 / 비파괴 마이그레이션): `admin_audit_logs` 는 신규 테이블 추가(`CREATE TABLE`)로
  기존 테이블·행에 영향이 없다(비파괴). `action`·`targetType` 을 enum 이 아닌 `String` 으로 저장하여
  향후 대상·조치 종류 추가 시 마이그레이션 없이 확장 가능하다.

- **NFR-005** (외부 의존 무): 013 은 신규 npm 의존을 0건 추가한다. 기존 Prisma·`@prisma/client`
  (`AdminAuditLog`·`SellerStatus`)·NestJS 가드만 사용하며, 신규 라이브러리·환경변수가 없다.

---

## 수용 기준

> **환경 태그 규약**:
> | 태그 | 의미 |
> |---|---|
> | `[env:unit]` | 단위 테스트(mock)로 판정 가능 |
> | `[env:static]` | 정적 코드 검증(코드 리뷰·grep·cross-schema 정적 테스트)으로 판정 |

- **SC-001** (`FR-003` 관련): 관리자가 판매자를 승인하면(`approveSeller(adminUserId, sellerId)`) 승인
  성공 후 `createAuditLog` 가 `{ adminId: adminUserId, action: AUDIT_ACTION.SELLER_APPROVE, targetType:
  AUDIT_TARGET.SELLER, targetId: sellerId }` 로 호출된다 — `approveSeller('admin-user-1', 's1')` →
  `createAuditLog({ adminId: 'admin-user-1', action: 'SELLER_APPROVE', targetType: 'SELLER', targetId:
  's1' })`. [env:unit]

- **SC-002** (`FR-004` 관련): `listAuditLogs(limit)` 가 `limit` 을 클램프하여 repository 를 호출한다 —
  `limit` 미지정 → `listAuditLogs(50)`(DEFAULT), `limit > MAX(200)` → `listAuditLogs(200)`(MAX 클램프).
  [env:unit]

- **SC-003** (`FR-004` 관련): `GET /admin/audit-logs` 가 관리자 전용으로 보호된다 — `AdminController` 가
  `@UseGuards(JwtAuthGuard, AdminGuard)` 적용(컨트롤러 레벨). [env:static]

- **SC-004** (`FR-001`·`FR-002` 관련): `AdminAuditLog` 테이블·컬럼·인덱스가 schema·마이그레이션 013 에
  존재하며(append-only — UPDATE/DELETE 미제공), `AdminRepository` 가 admin 스키마 외 모델을 직접 참조
  하지 않는다 — 마이그레이션 013(`CREATE TABLE "admin"."admin_audit_logs"` + 인덱스 2종) 비파괴 적용 +
  cross-schema 정적 검증(AdminRepository 규칙) PASS. [env:static]

---

## 요구사항 구조화 매트릭스

> 매핑 누락(SC 없는 FR/NFR, FR/NFR 없는 SC) 0건이 완료 조건.
> MoSCoW: Must / Should / Could / Won't

| US-ID | FR-ID | NFR-ID | SC-ID | [env:*] | MoSCoW |
|---|---|---|---|---|---|
| US-001 | FR-001 | NFR-002·004 | SC-004 | static | Must |
| US-001 | FR-002 | NFR-001 | SC-004 | static | Must |
| US-001 | FR-003 | NFR-002 | SC-001 | unit | Must |
| US-002 | FR-004 | NFR-003 | SC-002 | unit | Must |
| US-002 | FR-004 | NFR-003 | SC-003 | static | Must |

> 모든 FR(FR-001~004)이 SC 로 대응되며 매핑 누락 0건이다. SC-001·002 는 단위 테스트(`admin.service.
> spec.ts` 신규/갱신 단언)로 직접 검증되고, SC-003·004(가드·스키마·cross-schema)는 정적 코드/스키마
> 검증으로 판정된다. NFR-005(외부 의존 무)는 신규 의존 0건으로 충족하며 별도 SC 없음(부재가 곧 상태).
> `GET /admin/audit-logs` 의 HTTP end-to-end 통합 테스트는 부재하며 후속 권고다(GAP-013-03, coverage-gap.md).

---

## 해결된 선행 설계 공백

| 식별자 | 선행 spec | 등급 | 013 해결 내용 | 상태 |
|---|---|---|---|---|
| GAP-007-01 | 007-banner-stats-admin | Low | `admin_audit_logs`(append-only) 테이블 추가 + `AdminRepository` 빈 클래스 → 실 repository(create·list) + 판매자 승인 시 감사 기록(`approveSeller` 시그니처에 adminUserId 추가) + `GET /admin/audit-logs`(AdminGuard) 조회. **부분 해결** — 감사 대상은 판매자 승인(`SELLER_APPROVE`) 1종이며, banner CRUD·기타 관리자 mutation 의 감사 기록은 범위 외(GAP-013-01 후속 확장) | **RESOLVED (013, 커밋 b8b45aa) — 범위: 판매자 승인 감사 1종** |

> 007-banner-stats-admin/gaps.md 의 GAP-007-01 상태가 본 spec 으로 RESOLVED(013, 판매자 승인 감사
> 1종 한정)로 갱신되며, test/coverage-gap.md 의 해당 항목에 "013 에서 부분 해결(승인 감사)" 주석이
> 추가된다.

---

## 범위 외

- **판매자 승인 외 관리자 조치의 감사 기록**: 013 의 감사 대상은 판매자 승인(`SELLER_APPROVE`) 1종이다.
  banner CRUD(생성·수정·삭제)·기타 관리자 mutation 의 감사 기록은 본 spec 범위 외다(후속 확장 — 각
  도메인에서 `AdminService.recordAudit` 호출 또는 도메인 이벤트 구독 방식 검토, GAP-013-01). `action`·
  `targetType` 을 String 으로 둔 것은 이 확장을 마이그레이션 없이 수용하기 위함이다.
- **감사 기록 실패 격리/트랜잭션 원자성**: 현재 `approveSeller` 는 승인 성공 후 감사를 append 하나
  try/catch·`$transaction` 미적용이라 기록 실패 시 예외가 호출 측으로 전파된다(승인은 이미 커밋,
  감사만 실패해도 요청은 오류로 표면화 — 원자성 아님). 기록 실패 격리(try/catch 로 감사 실패를 흡수)
  또는 단일 트랜잭션 원자성은 본 spec 범위 외다(후속 검토 — GAP-013-02).
- **감사 로그 조회 HTTP 통합 테스트**: `GET /admin/audit-logs`(관리자 200·비인증 401·비관리자 403)의
  end-to-end 통합 테스트는 본 spec 범위 외다. 가드는 정적(SC-003)으로, 클램프·기록은 단위(SC-001·002)로
  검증하며, HTTP e2e 는 후속 권고다(GAP-013-03, coverage-gap.md).
- **감사 로그 cursor 페이지네이션·필터**: 현재 `listAuditLogs` 는 최신순 take 개(단순 limit 클램프)만
  제공한다. cursor 페이지네이션·adminId/action 필터 조회는 본 spec 범위 외다(현재 데이터량에서 불필요 —
  필요 시 후속 spec).

---

## 미결 사항

없음 — 본 spec 은 구현 완료 코드를 기준으로 retroactive 작성되었으며, 모든 요구사항·수용 기준이 실제
구현과 대조 확인되었다. 013 은 감사 대상 1종 한정·기록 실패 격리 부재·조회 HTTP e2e 부재를 Low 등급
잔여 권고로 남기되(GAP-013-01·02·03), 007 의 GAP-007-01 을 판매자 승인 감사 범위에서 RESOLVED 처리한다.
