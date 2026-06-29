---
작성: Database Design Agent
버전: v1.0
최종 수정: 2026-06-29 21:19
상태: 확정 (retroactive)
---

# Data Model: 013-admin-audit-log

## 목차

- [DB 선택 및 근거](#db-선택-및-근거)
- [신규 테이블](#신규-테이블)
  - [admin_audit_logs (AdminAuditLog)](#admin_audit_logs-adminauditlog)
- [데이터 무결성 규칙](#데이터-무결성-규칙)
- [인덱스 설계 근거](#인덱스-설계-근거)
- [마이그레이션 계획](#마이그레이션-계획)
- [적용 특이사항](#적용-특이사항)
- [롤백 전략](#롤백-전략)

---

## DB 선택 및 근거

- **DB**: PostgreSQL 16 — 단일 인스턴스(P-003). 007 과 동일 DB·Prisma multiSchema 구조 승계.
- **변경 성격**: `admin` 스키마에 신규 테이블 `admin_audit_logs`(`AdminAuditLog` 모델) **1종 추가** +
  인덱스 2종. 기존 테이블·enum·제약 변경 **없음**. 전체 테이블 29 → 30.
- **ORM**: Prisma `^6.19.0` multiSchema — `@@schema("admin")` 태그(007 `Banner` 와 동일 스키마).
- **목적**: 관리자 조치(현재 판매자 승인)를 append-only 로 기록하여 책임 추적(거버넌스)을 가능하게 한다
  (FR-001·FR-002, GAP-007-01 해결 — 판매자 승인 감사 1종 한정).

---

## 신규 테이블

### admin_audit_logs (AdminAuditLog)

admin 모듈 최초의 자기 소유 테이블(007 까지 admin 모듈은 자체 테이블 없이 도메인 Service 조합만 수행).

| 컬럼명 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | String | PK, `@default(cuid())` | 감사 로그 식별자 |
| `adminId` | String | (FK 미선언) | 조치 수행 관리자 userId — users.users.id 참조(cross-schema plain, P-001) |
| `action` | String | — | 조치 종류(예: `SELLER_APPROVE`) — 확장 위해 String |
| `targetType` | String | — | 대상 엔티티 종류(예: `SELLER`, `BANNER`, `USER`) |
| `targetId` | String | — | 대상 엔티티 식별자 |
| `createdAt` | DateTime | `@default(now())` | 기록 시각 |

```prisma
/// 관리자 조치 감사 로그 — append-only (013 GAP-007-01). 책임 추적용.
/// adminId/targetId 는 cross-schema plain String (P-001, FK 미선언).
model AdminAuditLog {
  id         String   @id @default(cuid())
  /// 조치를 수행한 관리자 userId (users.users.id 참조, FK 미선언)
  adminId    String
  /// 조치 종류 (예: SELLER_APPROVE) — 확장 위해 String
  action     String
  /// 대상 엔티티 종류 (예: SELLER, BANNER, USER)
  targetType String
  /// 대상 엔티티 식별자
  targetId   String
  createdAt  DateTime @default(now())

  @@index([createdAt(sort: Desc)])
  @@index([adminId, createdAt(sort: Desc)])
  @@map("admin_audit_logs")
  @@schema("admin")
}
```

> `adminId`·`targetId` 는 cross-schema plain String 으로 FK 를 선언하지 않는다(P-001 모듈 경계 — admin
> 스키마가 users·sellers 스키마에 FK 결합하지 않음). UNIQUE 제약·FK 0(append-only 메타 기록).

---

## 데이터 무결성 규칙

### append-only 규칙 (애플리케이션 레벨)

- `AdminRepository` 는 `createAuditLog`(INSERT)·`listAuditLogs`(SELECT)만 노출한다. `update`·`delete`
  메서드를 제공하지 않아 애플리케이션 경로로 감사 로그를 수정·삭제할 수 없다(위변조 표면 축소).
- 감사 로그는 관리자 조치 1건당 1행 append 된다. 현재 기록 경로는 `AdminService.approveSeller`(판매자
  승인) 1종이며 `action='SELLER_APPROVE'`·`targetType='SELLER'`·`targetId=sellerId`·`adminId=`승인 수행
  관리자 userId 로 기록한다.

### action·targetType 값 규칙

- `action`·`targetType` 은 String 이며 값은 `admin.constants.ts` 의 `AUDIT_ACTION`·`AUDIT_TARGET` 상수로
  관리한다(현재 `SELLER_APPROVE`·`SELLER` 각 1종). DB enum 제약이 없어 향후 대상·조치 확장 시 마이그레이션
  없이 상수만 추가한다(NFR-004 확장성 — GAP-013-01).

### adminId 출처 규칙

- `adminId` 는 클라이언트 입력이 아니라 `@CurrentUser().userId`(JWT 에서 확정한 승인 수행 관리자)다
  (NFR-003 — 위조 표면 차단). FK 미선언이라 DB 무결성으로 강제되진 않으나, 기록 경로가 서버 확정값만
  사용한다.

---

## 인덱스 설계 근거

| 인덱스 | 용도 |
|---|---|
| `(createdAt DESC)` | 전체 감사 로그 최신순 조회(`listAuditLogs` — `orderBy: { createdAt: 'desc' } take`)의 정렬·스캔 효율 |
| `(adminId, createdAt DESC)` | 특정 관리자별 조치 이력 최신순 조회(현재 미사용 — 향후 adminId 필터 조회 확장 대비) |

> 현재 `listAuditLogs(take)` 는 전체 최신순만 조회하므로 `(createdAt DESC)` 가 직접 활용된다.
> `(adminId, createdAt DESC)` 는 관리자별 책임 추적 조회(adminId 필터)를 위한 선행 인덱스다.

---

## 마이그레이션 계획

### 마이그레이션 파일

| 파일 | 위치 | 내용 |
|---|---|---|
| `20260629121613_013_admin_audit_log/migration.sql` | `apps/backend/prisma/migrations/` | Up: `CREATE TABLE "admin"."admin_audit_logs"`(id·adminId·action·targetType·targetId·createdAt DEFAULT CURRENT_TIMESTAMP, PK id) + `CREATE INDEX`(createdAt DESC)·(adminId, createdAt DESC). 신규 테이블 1·인덱스 2. |

> 실제 적용 마이그레이션 SQL 은 git 이 형상관리 SoT 다. 본 폴더의 [migrations/README.md](migrations/README.md)
> 가 그 경로·요약·적용 특이사항을 가리킨다(전체 SQL 중복 회피).

### 마이그레이션 순서

1. `admin.admin_audit_logs` 테이블 생성(비파괴 — 신규 테이블).
2. 인덱스 `(createdAt DESC)`·`(adminId, createdAt DESC)` 생성.
3. `prisma migrate status` up-to-date 확인(전체 테이블 30).

---

## 적용 특이사항

- **비파괴 신규 테이블 추가**: `CREATE TABLE` 은 기존 테이블·행에 영향이 없으며 데이터 손실 경고가 없다.
  따라서 008(기존 테이블 UNIQUE 제약 추가 — 비-TTY 프롬프트 이슈)과 달리 `prisma migrate dev` 로 정상
  적용했다. 적용 후 `prisma migrate status` up-to-date 를 확인했다.
- **admin 모듈 최초 자기 소유 테이블**: 007 까지 admin 모듈은 자체 테이블이 없었다(`Banner` 는 banner
  모듈 소유 — admin 스키마이나 admin 모듈 repository 가 아닌 BannerRepository 접근). 013 으로
  `AdminRepository` 가 admin 스키마 자기 소유 테이블(`admin_audit_logs`)을 직접 접근하는 최초 사례다.

---

## 롤백 전략

### DB 레벨 롤백

```sql
-- Down: admin_audit_logs 테이블·인덱스 제거 → 012 완료 기준 복원
DROP TABLE "admin"."admin_audit_logs";   -- 인덱스는 테이블 DROP 시 함께 제거
```

### 애플리케이션 레벨 롤백

- **비파괴성**: 신규 테이블만 추가했으므로 기존 테이블·행 데이터 영향 없음. TABLE DROP 으로 즉시 복원
  가능.
- **하위 호환성**: schema.prisma 에서 `AdminAuditLog` 제거 + `prisma generate` 재실행 시 애플리케이션이
  012 이전으로 복원 가능(단 `admin.repository`(create·list)·`admin.service`(approveSeller 감사·
  listAuditLogs)·`admin.controller`(audit-logs 라우트)·`admin.constants`(감사 상수)도 함께 되돌려야
  GAP-007-01 미해결 상태로 회귀 — `AdminRepository` 빈 클래스 복원).
- **데이터 손실 범위**: TABLE DROP 시 기록된 감사 로그가 손실된다(추적 메타 데이터). 단 판매자 승인
  상태(sellers 스키마)·기타 도메인 데이터에는 영향 없다(감사 로그는 별도 테이블).
