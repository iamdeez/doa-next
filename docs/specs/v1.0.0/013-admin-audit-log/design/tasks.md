---
작성: Design Agent
버전: v1.0
최종 수정: 2026-06-29 21:19
상태: 확정 (retroactive — 전 태스크 구현 완료)
---

# Tasks: 013-admin-audit-log

> Branch: 013-admin-audit-log | Date: 2026-06-29 | Plan: [../planning/plan.md](../planning/plan.md)

## 목차

- [전제 조건](#전제-조건)
- [태스크 목록](#태스크-목록)
- [Test Authoring Contract](#test-authoring-contract)
- [구현 완료 기준](#구현-완료-기준)

---

## 전제 조건

- [x] spec.md 의 모든 [NEEDS CLARIFICATION] 항목 해소(미결 사항: 없음)
- [x] plan.md Constitution Gates(P-001~P-007) 통과(예외 0건)
- [x] CHANGES.md 의 이전 작업(012-settlement-completed-at) "후속 작업 시 주의사항" 확인
- [x] DB Design Agent 활성(`admin_audit_logs` 테이블·인덱스 + 마이그레이션 013 — db-design/data-model.md)
- [x] Security Agent 활성(책임 추적·append-only·AdminGuard·adminId 서버 확정 — security/security-report.md)

> A = 데이터(schema·migration·repository·constants), B = 도메인(service), C = 인터페이스(controller),
> D = 테스트(5a). 레이어 A→B→C→D 의존 순.

---

## 태스크 목록

> 레이어: A 데이터 / B 도메인 / C 인터페이스 / D 테스트(5a).

### Step 1. 스키마·마이그레이션 (A — DB Design Agent 산출)

- [x] **T001** — `AdminAuditLog` 모델 추가(append-only)
  - 레이어: A
  - 구현 파일: `apps/backend/prisma/schema.prisma`
  - 관련 요구사항: FR-001
  - 상세: `admin` 스키마에 `AdminAuditLog`(id cuid PK·adminId·action·targetType·targetId·createdAt
    `@default(now())`) 추가. 인덱스 `(createdAt desc)`·`(adminId, createdAt desc)`. `@@map("admin_audit_
    logs")`·`@@schema("admin")`. 주석 — append-only, adminId/targetId cross-schema plain String(P-001).
  - 완료 기준: `prisma generate` 후 `AdminAuditLog` 타입 생성.

- [x] **T002** — 마이그레이션 013 생성·적용
  - 레이어: A
  - 구현 파일: `apps/backend/prisma/migrations/20260629121613_013_admin_audit_log/migration.sql`
  - 관련 요구사항: FR-001, NFR-004
  - 상세: `CREATE TABLE "admin"."admin_audit_logs"`(id·adminId·action·targetType·targetId·createdAt
    DEFAULT CURRENT_TIMESTAMP, PK id) + `CREATE INDEX`(createdAt DESC)·(adminId, createdAt DESC). 비파괴
    신규 테이블 — `migrate dev` 적용. 전체 테이블 29→30.
  - 완료 기준: `prisma migrate status` up-to-date.

### Step 2. repository·상수 (A)

- [x] **T003** — `AdminRepository` 빈 클래스 → create·list
  - 레이어: A
  - 구현 파일: `apps/backend/src/modules/admin/admin.repository.ts`
  - 관련 요구사항: FR-002, NFR-001·002
  - 상세: `createAuditLog({ adminId, action, targetType, targetId }): Promise<AdminAuditLog>`(`adminAuditLog.
    create({ data })`) + `listAuditLogs(take): Promise<AdminAuditLog[]>`(`findMany({ orderBy: { createdAt:
    'desc' }, take })`). admin 스키마 자기 소유 테이블만 접근(UPDATE/DELETE 미제공 — append-only).
  - 완료 기준: `AdminService` 가 `createAuditLog`·`listAuditLogs` 호출 가능.

- [x] **T004** — 감사 상수 추가
  - 레이어: A
  - 구현 파일: `apps/backend/src/modules/admin/admin.constants.ts`
  - 관련 요구사항: FR-003·FR-004
  - 상세: `DEFAULT_AUDIT_LOG_LIMIT(50)`·`MAX_AUDIT_LOG_LIMIT(200)`·`AUDIT_ACTION = { SELLER_APPROVE }`·
    `AUDIT_TARGET = { SELLER }`(String 상수 — 확장성).
  - 완료 기준: service 가 상수 import 사용.

### Step 3. service 감사 기록·조회 (B)

- [x] **T005** — `approveSeller` 시그니처 변경 + 감사 기록
  - 레이어: B
  - 구현 파일: `apps/backend/src/modules/admin/admin.service.ts`
  - 관련 요구사항: FR-003
  - 상세: `approveSeller(adminUserId, sellerId)`(시그니처 변경) — `sellerService.approve(sellerId)` 성공
    후 `createAuditLog({ adminId: adminUserId, action: AUDIT_ACTION.SELLER_APPROVE, targetType: AUDIT_
    TARGET.SELLER, targetId: sellerId })`. 감사는 승인 성공 후 append(try/catch·tx 미적용 — 단순화).
  - 완료 기준: 승인 시 감사 로그 append.

- [x] **T006** — `listAuditLogs` 조회(클램프)
  - 레이어: B
  - 구현 파일: `apps/backend/src/modules/admin/admin.service.ts`
  - 관련 요구사항: FR-004
  - 상세: `listAuditLogs(limit)` — `take = min(max(limit ?? DEFAULT_AUDIT_LOG_LIMIT, 1), MAX_AUDIT_LOG_
    LIMIT)` → `adminRepository.listAuditLogs(take)`.
  - 완료 기준: limit 미지정 50·초과 200 클램프.

### Step 4. controller 라우트 (C)

- [x] **T007** — adminUserId 전달 + `GET /admin/audit-logs`
  - 레이어: C
  - 구현 파일: `apps/backend/src/modules/admin/admin.controller.ts`
  - 관련 요구사항: FR-003·FR-004
  - 상세: `POST /admin/sellers/:id/approve` 가 `@CurrentUser() user` → `approveSeller(user.userId,
    sellerId)`. `GET /admin/audit-logs?limit=` → `listAuditLogs(limit?)`. 컨트롤러 레벨 `@UseGuards(
    JwtAuthGuard, AdminGuard)`(007 기존)에 포섭.
  - 완료 기준: 라우트 등록·가드 적용.

### Step 5. 테스트 (D 레이어 — 5a Test Agent AUTHORING)

> 본 Step 은 **5a Test Agent(AUTHORING)** 가 작성. 013 은 기존 `approveSeller` 테스트의 단언을 감사 append
> 포함하도록 갱신(it 명도 `..._and_records_audit` 으로)하고, `listAuditLogs` describe 2건을 신규 추가한다.

- [x] **T008** — `approveSeller` 감사 단언 갱신 + `listAuditLogs` 2건 (`admin.service.spec.ts`) — SC-001·002
  - 기존 `approveSeller` 테스트: `approveSeller('admin-user-1', 's1')` + `createAuditLog` 감사 append 단언
    추가(it 명 `when_called_then_reuses_seller_approve_and_records_audit`) — SC-001
  - 신규 `listAuditLogs` describe 2 it(): `when_limit_undefined_then_default_clamped_take`(→50) +
    `when_limit_exceeds_max_then_clamped_to_max`(→MAX 200) — SC-002
  - `AdminRepository` mock provider 추가(createAuditLog·listAuditLogs jest.fn())
  - 신규 it() +2(unit 합계 253→255)

- [x] **T009** — cross-schema AdminRepository 규칙 주석·label 갱신 (`test/static/cross-schema.spec.ts`) — SC-004
  - AdminRepository 규칙 주석을 "admin 스키마 자기 소유 테이블(admin_audit_logs) 접근(013)"으로 갱신,
    label `AdminRepository (007)` → `(007/013)`. forbiddenModels(타 스키마 모델)는 유지 — admin 스키마
    모델은 forbidden 아님(자기 소유 허용). 신규 it() 0(기존 규칙 테이블 항목 갱신).

---

## Test Authoring Contract

> **5a Test Agent(AUTHORING) 입력 contract**. production canonical 심볼 명시(추측 단언 금지).

### Production canonical 심볼

| 심볼 | canonical 형태 |
|---|---|
| `AdminService` | `approveSeller(adminUserId, sellerId)`·`listAuditLogs(limit)` |
| `AdminRepository`(mock) | `createAuditLog({ adminId, action, targetType, targetId })`·`listAuditLogs(take)` |
| `SellerService`(mock) | `approve(sellerId)`·`listByStatus(status)` |
| 상수 | `AUDIT_ACTION.SELLER_APPROVE`(='SELLER_APPROVE')·`AUDIT_TARGET.SELLER`(='SELLER')·`DEFAULT_AUDIT_LOG_LIMIT`(50)·`MAX_AUDIT_LOG_LIMIT`(200) |

### mock 재현 규약

- **approveSeller(SC-001)**: `mockSellerService.approve.mockResolvedValue({ id:'s1', status:'APPROVED' })`,
  `mockAdminRepository.createAuditLog.mockResolvedValue({ id:'log-1' })` →
  `service.approveSeller('admin-user-1', 's1')` →
  `expect(mockAdminRepository.createAuditLog).toHaveBeenCalledWith({ adminId:'admin-user-1', action:
  AUDIT_ACTION.SELLER_APPROVE, targetType: AUDIT_TARGET.SELLER, targetId:'s1' })` + `expect(mockSeller
  Service.approve).toHaveBeenCalledWith('s1')`.
- **listAuditLogs(SC-002)**: `mockAdminRepository.listAuditLogs.mockResolvedValue([])` →
  `service.listAuditLogs(undefined)` → `expect(mockAdminRepository.listAuditLogs).toHaveBeenCalledWith(50)`;
  `service.listAuditLogs(9999)` → `...toHaveBeenCalledWith(MAX_AUDIT_LOG_LIMIT)`.

### SC → 테스트 매핑

| SC-ID | 수용 기준 | 테스트 파일·describe | 비고 |
|---|---|---|---|
| SC-001 | approveSeller 시 감사 append | admin.service.spec.ts::approveSeller (갱신) | [env:unit] |
| SC-002 | listAuditLogs limit 클램프 | admin.service.spec.ts::listAuditLogs (신규 2 it()) | [env:unit] |
| SC-003 | audit-logs 라우트 가드 | (정적) admin.controller.ts `@UseGuards(JwtAuthGuard, AdminGuard)` | [env:static] |
| SC-004 | 테이블·인덱스·경계 | (정적) schema·migration·cross-schema.spec.ts AdminRepository 규칙 | [env:static] |

---

## 구현 완료 기준

- [x] 모든 A·B·C 태스크 체크박스 완료(4단계), D 태스크 완료(5a)
- [x] `pnpm --filter backend test` 전체 PASSED — 007~012 회귀 0 + 013 신규/갱신 단언 PASS `[TypeScript/NestJS]`
- [x] `tsc --noEmit` 0 error
- [x] 마이그레이션 013 적용(`migrate status` up-to-date — `admin_audit_logs` 테이블 추가, 전체 30)
- [x] `approveSeller` 시그니처 변경 잔여 참조 0(controller 1건 갱신 — grep)
- [x] `AdminRepository` admin 스키마만 접근 확인(cross-schema 정적 PASS)
- [x] `package.json` 신규 의존 0
- [x] git status 의도치 않은 파일 없음
