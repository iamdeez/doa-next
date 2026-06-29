---
작성: Planning Agent
버전: v1.0
최종 수정: 2026-06-29 21:19
상태: 확정 (retroactive)
---

# Plan: 013-admin-audit-log

> Branch: 013-admin-audit-log | Date: 2026-06-29 | Spec: [../spec/spec.md](../spec/spec.md)

## 목차

- [사전 검증 (Constitution Gates)](#사전-검증-constitution-gates)
- [기술 컨텍스트](#기술-컨텍스트)
- [사전 영향도 분석 결과](#사전-영향도-분석-결과)
- [핵심 설계](#핵심-설계)
- [결정 기록 (ADRs)](#결정-기록-adrs)
- [인터페이스 계약](#인터페이스-계약)
- [데이터 모델](#데이터-모델)
- [테스트 전략](#테스트-전략)
- [기타 고려사항](#기타-고려사항)

---

## 사전 검증 (Constitution Gates)

> `constitution.md`(P-001~P-007) 존재 → 해당 조항을 Gates 로 사용한다(constitution 우선). spec.md NFR
> (NFR-001~005)은 P-001 모듈 경계·보안(책임 추적)을 구체화하며 충돌(완화) 없음.

- [x] **P-001 모듈 경계 원칙**: [Pass 기준: admin 모듈이 자기 소유 스키마(admin.*) 외 타 도메인 모델을 직접 참조하지 않음]
  → PASS(강화). 013 으로 `AdminRepository` 가 admin 스키마 자기 소유 테이블(`admin_audit_logs`)만 접근하는 실 repository 가 됨(007 빈 클래스 → 013 실 repo). 타 도메인(판매자 승인·사용자 조회)은 여전히 Seller/User Service DI 경유(직접 쿼리 0). cross-schema 정적 검증(AdminRepository 규칙 — 타 스키마 모델 forbidden) PASS.
- [x] **P-002 AWS 의존 금지 / 외부 의존 추상화 원칙**: [Pass 기준: `@aws-sdk/*` 및 신규 npm 의존 0건]
  → PASS. 신규 npm 의존 0건(`package.json` 변경 없음). 기존 Prisma·`@prisma/client`(`AdminAuditLog`·`SellerStatus`)·NestJS 가드만.
- [x] **P-003 단일 DB 원칙**: [Pass 기준: 단일 PostgreSQL 외 외부 저장소 0건]
  → PASS. 단일 PostgreSQL. `admin_audit_logs` 단일 테이블 추가(비파괴 `CREATE TABLE`).
- [x] **P-004 클라우드 중립 원칙**: [Pass 기준: 클라우드 전용 API 결합 0건]
  → PASS. 순수 Prisma 테이블·service·NestJS 가드. 클라우드 전용 API 0.
- [x] **P-005 결제·정산 정합성 원칙**: [Pass 기준: 금전 수치 Decimal, 정산 기준의 정확성]
  → PASS(무관). `admin_audit_logs` 는 금전 필드가 없다(메타 기록 — adminId·action·targetType·targetId·createdAt). 정산·금액 로직 변경 0.
- [x] **P-006 테스트 원칙**: [Pass 기준: SC-XXX 없는 FR-XXX 0건]
  → PASS. FR-001→SC-004, FR-002→SC-004, FR-003→SC-001, FR-004→SC-002·003. SC-001·002 단위 직접, SC-003·004 정적(가드·스키마·cross-schema). 조회 HTTP e2e 부재는 GAP-013-03 기록.
- [x] **P-007 스펙 범위 원칙**: [Pass 기준: spec.md 범위 외 변경 파일 0건]
  → PASS. 변경 범위 = schema.prisma(AdminAuditLog)·migration 013·admin.repository(create·list)·admin.service(approveSeller 시그니처+감사·listAuditLogs)·admin.controller(adminUserId 전달·audit-logs 라우트)·admin.constants(상수)·admin.service.spec(+2)·cross-schema.spec(주석·label). 전부 FR-001~004 추적 가능. 범위 외 리팩토링 0.

> **예외 사항**: 없음. P-001~P-007 전부 통과(예외 0건).

> **Gates 판정**: P-001~P-007 전부 통과(예외 0건). Design Agent(3단계) → Database Design Agent(테이블·마이그레이션) → Security Agent(책임 추적·AdminGuard) 진입 가능.

---

## 기술 컨텍스트

> 007 의 확정 스택을 재확정. 013 고유 변경만 명시.

- **언어 / 런타임**: TypeScript 5.4 / Node.js 20.x. pnpm + Turborepo.
- **백엔드 프레임워크**: NestJS 11.x. admin 모듈 3계층(controller·service·repository).
- **ORM / DB**: Prisma `^6.19.0` multiSchema + PostgreSQL 16. **DB 스키마 변경: `admin_audit_logs`
  테이블 1종 신규 추가** — 비파괴 마이그레이션 013(`CREATE TABLE "admin"."admin_audit_logs"` + 인덱스
  2종). 전체 테이블 29 → 30.
- **인가**: `AdminController` 컨트롤러 레벨 `@UseGuards(JwtAuthGuard, AdminGuard)`(007 기존) — `GET
  /admin/audit-logs` 도 동일 가드 적용. `AdminGuard` 는 `ADMIN_USER_IDS` 기반 fail-closed.
- **현재 사용자 주입**: `@CurrentUser() user: AuthenticatedUser` 데코레이터(기존 공유 모듈)로
  `user.userId` 를 승인 수행 관리자(adminId)로 확정.
- **테스트 프레임워크**: Jest(`*.spec.ts`, src rootDir). 단위([env:unit] — SC-001·002), 정적([env:static]
  — SC-003·004, cross-schema).
- **환경변수**: 신규 0(`ADMIN_USER_IDS` 는 007 기존). **신규 의존성**: 0건.

---

## 사전 영향도 분석 결과

> 상세는 [../design/research.md](../design/research.md) 참조. 본 절은 영향 파일 요약.

### 영향 파일 목록

| 파일 | 변경 유형 | 영향 내용 | 레이어 |
|---|---|---|---|
| `prisma/schema.prisma` | 수정 | `AdminAuditLog` 모델(append-only, 인덱스 2종) 추가 | A(스키마) |
| `prisma/migrations/20260629121613_013_admin_audit_log/migration.sql` | 신규 | `CREATE TABLE "admin"."admin_audit_logs"` + 인덱스 `(createdAt desc)`·`(adminId, createdAt desc)` | A(마이그레이션) |
| `src/modules/admin/admin.repository.ts` | 수정 | 빈 클래스 → `createAuditLog`·`listAuditLogs(take)`(admin 스키마 `adminAuditLog` 접근) | A |
| `src/modules/admin/admin.constants.ts` | 수정 | `DEFAULT/MAX_AUDIT_LOG_LIMIT(50/200)`·`AUDIT_ACTION.SELLER_APPROVE`·`AUDIT_TARGET.SELLER` 추가 | A |
| `src/modules/admin/admin.service.ts` | 수정 | `approveSeller(adminUserId, sellerId)` 시그니처 변경 + 승인 후 감사 기록 + `listAuditLogs(limit)`(클램프) | B |
| `src/modules/admin/admin.controller.ts` | 수정 | `approveSeller` 에 `@CurrentUser().userId` 전달 + `GET /admin/audit-logs` 라우트 추가 | C |
| `src/modules/admin/admin.service.spec.ts` | 수정 | approveSeller 단언 갱신(감사 append) + `listAuditLogs` describe 2건 추가(+2 it()) | D |
| `test/static/cross-schema.spec.ts` | 수정 | AdminRepository 규칙 주석·label(007→007/013) 갱신 — admin 스키마 자기 소유 접근 명시(신규 it() 0) | D(정적) |

> `seller.service.ts`·`user.service.ts`·`order/*`·`banner/*`·`stats/*` 변경 0건(타 도메인 계약 불변 —
> `SellerService.approve(sellerId)` 시그니처 불변, admin 이 재사용).

---

## 핵심 설계

### 1. admin_audit_logs 테이블 추가 (FR-001 — append-only 감사 로그)

```prisma
/// 관리자 조치 감사 로그 — append-only (013 GAP-007-01). 책임 추적용.
model AdminAuditLog {
  id         String   @id @default(cuid())
  adminId    String   // 조치 수행 관리자 userId (users.users.id 참조, FK 미선언 — P-001)
  action     String   // 조치 종류 (예: SELLER_APPROVE) — 확장 위해 String
  targetType String   // 대상 엔티티 종류 (예: SELLER, BANNER, USER)
  targetId   String   // 대상 엔티티 식별자
  createdAt  DateTime @default(now())

  @@index([createdAt(sort: Desc)])
  @@index([adminId, createdAt(sort: Desc)])
  @@map("admin_audit_logs")
  @@schema("admin")
}
```

- admin 모듈 최초 자기 소유 테이블. 인덱스 2종 — 전체 최신순 조회(`createdAt desc`)·관리자별 조회
  (`adminId, createdAt desc`). UPDATE/DELETE 미제공(append-only).

### 2. AdminRepository — 빈 클래스 → 실 repository (FR-002)

```
createAuditLog({ adminId, action, targetType, targetId }):   # append-only 1건
  return prisma.tx.adminAuditLog.create({ data })

listAuditLogs(take):                                          # 최신순 take 개
  return prisma.tx.adminAuditLog.findMany({ orderBy: { createdAt: 'desc' }, take })
```

- admin 스키마 자기 소유 테이블(`adminAuditLog`)만 접근(P-001 강화). UPDATE/DELETE 메서드 부재
  (append-only — 위변조 표면 축소).

### 3. 판매자 승인 감사 기록 (FR-003 — approveSeller 시그니처 변경)

```
# AdminController
POST /admin/sellers/:id/approve:
  approveSeller(@CurrentUser().userId, sellerId)             # adminUserId = 승인 수행 관리자

# AdminService
approveSeller(adminUserId, sellerId):
  result = sellerService.approve(sellerId)                   # 기존 승인 로직 재사용(시그니처 불변)
  createAuditLog({ adminId: adminUserId, action: SELLER_APPROVE, targetType: SELLER, targetId: sellerId })
  return result                                              # 승인 성공 후 감사 append
```

- `approveSeller(sellerId)` → `approveSeller(adminUserId, sellerId)`(시그니처 변경 — 호출 측
  controller 1건 갱신). 감사는 승인 성공 후 append(기록 순서 — 기록 실패가 승인을 롤백하지 않음). 단
  try/catch·`$transaction` 미적용이라 기록 실패 시 예외 전파(원자성 아님 — GAP-013-02).

### 4. 감사 로그 조회 (FR-004 — GET /admin/audit-logs + 클램프)

```
# AdminController (컨트롤러 레벨 @UseGuards(JwtAuthGuard, AdminGuard))
GET /admin/audit-logs?limit=:
  listAuditLogs(limit ? parseInt(limit) : undefined)

# AdminService
listAuditLogs(limit):
  take = min(max(limit ?? DEFAULT_AUDIT_LOG_LIMIT, 1), MAX_AUDIT_LOG_LIMIT)   # 1..200, 미지정 50
  return adminRepository.listAuditLogs(take)
```

- `limit` 클램프(`1..MAX(200)`, 미지정 시 `DEFAULT(50)`) — 007 사용자 목록 클램프와 동형. AdminGuard
  fail-closed 로 관리자 전용.

---

## 결정 기록 (ADRs)

| ADR-ID | 결정 항목 | 채택안 | 대안(검토했으나 미채택) | 근거(spec FR/NFR) | 영향 범위 |
|---|---|---|---|---|---|
| ADR-001 | 감사 로그 테이블 소유 | admin 스키마 자기 소유 `admin_audit_logs` | 공통 audit 공유 테이블 | FR-001·FR-002, NFR-001 (P-001 — admin 모듈 자기 소유 테이블 최초 보유) | schema·admin.repository·cross-schema |
| ADR-002 | action·targetType 타입 | `String`(상수 `AUDIT_ACTION`·`AUDIT_TARGET`) | Prisma enum | NFR-004 (확장성 — 대상·조치 추가 시 마이그레이션 불필요) | schema·admin.constants |
| ADR-003 | 감사 대상 범위 | 판매자 승인(`SELLER_APPROVE`) 1종 우선 | 전 관리자 mutation | spec 범위(007 대표 사례부터, banner 등 후속 — GAP-013-01) | admin.service |
| ADR-004 | 감사 기록 시점·방식 | 승인 성공 후 append(try/catch·tx 미적용) | 승인 전 기록 / 단일 트랜잭션 | FR-003 (기록 실패가 승인 롤백 안 함 — 단 원자성 아님, GAP-013-02) | admin.service |
| ADR-005 | adminId 출처 | 서버 `@CurrentUser().userId` | 클라이언트 입력 | NFR-003 (위조 표면 차단 — JWT 에서 확정) | admin.controller·admin.service |
| ADR-006 | 조회 limit 처리 | `1..MAX(200)` 클램프(DEFAULT 50) | 무제한 | FR-004 (과도 조회 방지 — 007 클램프 동형) | admin.service·admin.constants |

---

## 인터페이스 계약

### 013 변경 인터페이스

```ts
// AdminRepository — 빈 클래스 → 실 repository (admin 스키마 자기 소유 접근)
createAuditLog(data: { adminId: string; action: string; targetType: string; targetId: string }):
  Promise<AdminAuditLog>;
listAuditLogs(take: number): Promise<AdminAuditLog[]>;       // 최신순, take 개 (호출 측 클램프)

// AdminService.approveSeller — 시그니처 변경(adminUserId 추가, BREAKING — 호출 측 controller 갱신)
approveSeller(adminUserId: string, sellerId: string): Promise<SellerProfile>;   // 승인 후 감사 append
listAuditLogs(limit: number | undefined): Promise<AdminAuditLog[]>;             // 1..MAX 클램프

// AdminController — adminUserId 전달 + 신규 라우트
POST /admin/sellers/:id/approve  → approveSeller(@CurrentUser().userId, sellerId)
GET  /admin/audit-logs?limit=    → listAuditLogs(limit?)   // JwtAuthGuard+AdminGuard (컨트롤러 레벨)

// SellerService.approve — 시그니처 불변(admin 이 재사용)
approve(sellerId: string): Promise<SellerProfile>;
```

### 하위 호환성 / 방어 코드

- **`approveSeller` 시그니처 변경(BREAKING — 내부 호출 측 1건 갱신)**: `approveSeller(sellerId)` →
  `approveSeller(adminUserId, sellerId)`. 호출 측은 `AdminController.approveSeller` 단일이며 013 에서
  `@CurrentUser().userId` 전달로 갱신했다. `AdminService` 외부에서 `approveSeller` 를 호출하는 다른
  코드는 없다(grep 확인 — controller 1건). `SellerService.approve(sellerId)` 외부 계약은 불변.
- **`AdminRepository` 빈 클래스 → 실 repository(비파괴)**: 007 의 빈 `AdminRepository` 는 의존 주입만
  되어 있었고, 013 이 메서드를 추가했다. 기존 admin 흐름(승인·사용자 목록)은 Service DI 경유라 영향
  없으며, `admin.service.spec` 에 `AdminRepository` mock provider 를 추가했다.
- **신규 테이블(비파괴)**: `admin_audit_logs` 는 신규 테이블 추가라 기존 테이블·행·쿼리에 영향 0.
  `action`·`targetType` String 으로 향후 대상·조치 확장 시 마이그레이션 불필요.

---

## 데이터 모델

> 상세는 [../db-design/data-model.md](../db-design/data-model.md) 참조.

`admin` 스키마에 append-only `admin_audit_logs` 테이블 1종을 추가한다(`AdminAuditLog` 모델 — adminId·
action·targetType·targetId·createdAt, 인덱스 `(createdAt desc)`·`(adminId, createdAt desc)`).
마이그레이션 013(`20260629121613_013_admin_audit_log`)이 `CREATE TABLE "admin"."admin_audit_logs"` +
인덱스 2종을 적용한다(비파괴). 신규 enum·제약(UNIQUE/FK)·기존 테이블 변경은 없다. Database Design Agent
활성(테이블·인덱스·마이그레이션 생성).

---

## 테스트 전략

### SC↔테스트 매핑 (요약)

| SC 식별자 | 수준 | 유형 | 시나리오 요약 | 입력 | 기대 결과 |
|---|---|---|---|---|---|
| SC-001 | 단위 | Happy | approveSeller 시 감사 append | `approveSeller('admin-user-1', 's1')` | `createAuditLog({ adminId:'admin-user-1', action:'SELLER_APPROVE', targetType:'SELLER', targetId:'s1' })` |
| SC-002 | 단위 | Happy/Edge | listAuditLogs limit 클램프 | `listAuditLogs(undefined)` / `listAuditLogs(9999)` | `listAuditLogs(50)` / `listAuditLogs(200)` |
| SC-003 | 정적 | 코드검증 | audit-logs 라우트 가드 | AdminController `@UseGuards` | `JwtAuthGuard, AdminGuard`(컨트롤러 레벨) |
| SC-004 | 정적 | 스키마/cross-schema | 테이블·인덱스·경계 | schema·migration·cross-schema | `AdminAuditLog`(append-only) + AdminRepository admin 스키마만 |

### smoke_tests

- 필요 여부: N. 013 은 admin 모듈에 자기 소유 테이블·감사 기록·조회 라우트를 더하는 패치이며 신규
  AppModule 와이어링(AdminModule 은 007 기존)·신규 모듈이 없다. 단위 테스트(mock)로 감사 append·조회
  클램프를 직접 단언하고, 가드·스키마·모듈 경계는 정적 검증으로 확인한다. `GET /admin/audit-logs` HTTP
  e2e 는 후속 권고(GAP-013-03). 007~012 기존 e2e+static 부팅은 회귀 0 으로 유지된다(16/84).

---

## 기타 고려사항

- **감사 대상 1종 한정(설계 결정)**: 013 의 감사 기록은 판매자 승인(`SELLER_APPROVE`) 1경로뿐이다.
  banner CRUD·기타 관리자 mutation 은 아직 감사되지 않는다. `action`·`targetType` 을 String 으로 둔 것은
  향후 각 도메인에서 `AdminService.recordAudit`(혹은 도메인 이벤트 구독)로 감사 대상을 확장할 때
  마이그레이션 없이 수용하기 위함이다(GAP-013-01).
- **감사 기록 격리·원자성(설계 한계)**: 현재 `approveSeller` 는 `sellerService.approve` → `createAuditLog`
  를 순차 await 하며 단일 `$transaction` 으로 묶지 않는다. 승인은 이미 커밋된 뒤 감사가 append 되므로
  기록 실패가 승인을 롤백하지 않으나, try/catch 가 없어 기록 실패 시 예외가 호출 측으로 전파되어 요청은
  오류로 표면화된다(원자성 아님). 후속에 (a) try/catch 로 감사 실패를 흡수하거나 (b) 단일 트랜잭션으로
  원자화하는 방향을 검토할 수 있다(GAP-013-02).
- **모듈 경계 강화(P-001)**: 013 으로 admin 모듈이 처음 자기 소유 테이블을 보유하나, 판매자 승인·사용자
  조회 등 타 도메인 데이터 접근은 여전히 Seller/User Service DI 경유다. `AdminRepository` 는 admin
  스키마(`adminAuditLog`)만 접근하며 cross-schema 정적 검증의 AdminRepository 규칙(타 스키마 모델
  forbidden)을 통과한다.
- **adminId 위조 표면 부재**: `adminId` 는 클라이언트 입력이 아니라 `@CurrentUser().userId`(JWT 에서
  확정한 승인 수행 관리자)다. 감사 로그의 책임 추적 신뢰성을 위해 이 출처를 클라이언트 입력으로 바꾸면
  안 된다(ADR-005).
