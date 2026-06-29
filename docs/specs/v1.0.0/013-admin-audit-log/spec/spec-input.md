---
작성: Spec Agent
버전: v1.0
최종 수정: 2026-06-29 21:19
상태: 확정 (retroactive)
---

# Spec Input: 013-admin-audit-log

> 수집 일시: 2026-06-29 | 맥락: 007 설계·보안 공백(GAP-007-01 — 관리자 액션 audit log 부재) 후속 보강
> → 정식 SDD 문서화

## 목차

- [수집 진행 상태](#수집-진행-상태)
- [원 요청 맥락](#원-요청-맥락)
- [질문 분석 근거](#질문-분석-근거-question-analysis-basis)
- [카테고리별 수집 내용](#카테고리별-수집-내용)

## 수집 진행 상태

| 카테고리 | 상태 | 답변 완료 항목 |
|---|---|---|
| 1. 배경 및 목적 | 완료 | [Q1, Q2, Q3] |
| 2. 사용자 & 이해관계자 | 완료 | [Q4] |
| 3. 핵심 기능 | 완료 | [Q-A~E] |
| 4. 데이터 & 입출력 | 완료 | [Q-F] |
| 5. 제약조건 | 완료 | [Q5] |
| 6. 예외 & 실패 시나리오 | 완료 | [Q6] |

## 원 요청 맥락

사용자 지시: **007 관리자 audit log 보강** — 007-banner-stats-admin 의 GAP-007-01(관리자 조치 추적
공백 — `AdminRepository` 빈 클래스, 판매자 승인 등 관리자 조치의 audit trail 부재)를 해소하는 패치.
admin 스키마에 append-only `admin_audit_logs` 테이블을 추가하고(`AdminAuditLog` 모델), `AdminRepository`
를 빈 클래스에서 실 repository(`createAuditLog`·`listAuditLogs`)로 채우며, 판매자 승인
(`approveSeller`) 시 감사 로그를 기록(`approveSeller` 시그니처에 승인 관리자 userId 추가)하고, 관리자
전용 조회 `GET /admin/audit-logs`(AdminGuard)를 노출했다. 본 문서는 그 패치를 정식 SDD 포맷으로 보강하기
위한 입력 재구성이다.

## 질문 분석 근거 (Question Analysis Basis)

| 질문 ID | 요지 | 옵션·근거 | 채택 결과 |
|---|---|---|---|
| Q-A | 감사 로그 테이블 소유 | A:공유 테이블(공통 audit) / B:admin 스키마 자기 소유 | **B 채택**(P-001 모듈 경계 — admin 모듈이 자기 소유 테이블 최초 보유. 타 도메인 데이터는 Service DI 유지) |
| Q-B | action·targetType 타입 | A:Prisma enum / B:String + 상수 | **B 채택**(확장성 — 향후 BANNER·USER 등 대상·조치 추가 시 마이그레이션 없이 수용. 값은 `AUDIT_ACTION`·`AUDIT_TARGET` 상수로 관리) |
| Q-C | 감사 대상 범위 | A:전 관리자 mutation / B:판매자 승인 1종 우선 | **B 채택**(007 GAP 의 대표 사례인 판매자 승인부터. banner CRUD·기타 mutation 감사는 후속 확장 — GAP-013-01) |
| Q-D | 감사 기록 시점 | A:승인 전 / B:승인 성공 후 append | **B 채택**(기록 실패가 승인 자체를 롤백하지 않도록 승인 성공 후 append. 단 try/catch·트랜잭션 미적용이라 기록 실패 시 예외 전파 — GAP-013-02) |
| Q-E | adminId 출처 | A:클라이언트 입력 / B:서버 `@CurrentUser().userId` | **B 채택**(위조 표면 차단 — 승인 수행 관리자를 서버가 JWT 에서 확정. `approveSeller` 시그니처에 adminUserId 추가) |
| Q-F | 조회 limit 처리 | A:무제한 / B:1..MAX 클램프(DEFAULT) | **B 채택**(과도 조회 방지 — `DEFAULT_AUDIT_LOG_LIMIT(50)`·`MAX_AUDIT_LOG_LIMIT(200)` 클램프, 007 사용자 목록 클램프와 동형) |

## 카테고리별 수집 내용

### [카테고리 1] 배경 및 목적

Q1. 왜 만드는가?
- 007 의 운영 추적 공백 해소(GAP-007-01): admin 모듈이 판매자 승인 등 관리자 조치를 수행하나 누가·언제·
  무엇을 했는지 기록하는 append-only 감사 로그가 없어 다수 관리자 운영 시 책임 추적(거버넌스) 불가.

Q2. 현재 어떻게? (013 이전)
- `AdminRepository` 는 자체 테이블 없는 빈 클래스(007 ADR-004). `approveSeller(sellerId)` 가
  `SellerService.approve` 만 호출(audit trail 없음). admin 스키마에 audit 테이블 부재.

Q3. 성공 판단 기준
- `admin_audit_logs`(append-only) 테이블 존재. `approveSeller(adminUserId, sellerId)` 가 승인 후
  `createAuditLog` 기록. `GET /admin/audit-logs`(AdminGuard) 최신순 조회(limit 클램프).

### [카테고리 2] 사용자 & 이해관계자

Q4. 사용자 역할
- 플랫폼 운영자: 관리자 조치(판매자 승인)의 수행 주체 — `adminId` 로 기록 대상.
- 감사자(운영 관리자): `GET /admin/audit-logs` 조회 주체 — 책임 추적 수혜자.
- 시스템(AdminGuard): 관리자 식별·인가 — `ADMIN_USER_IDS` 기반 fail-closed.

### [카테고리 3] 핵심 기능

**Must:**
- `admin` 스키마 `admin_audit_logs`(append-only) 테이블 + `AdminAuditLog` 모델(adminId·action·
  targetType·targetId·createdAt, 인덱스 2종).
- `AdminRepository.createAuditLog`·`listAuditLogs(take)`(빈 클래스 → 실 repository).
- `AdminService.approveSeller(adminUserId, sellerId)`: 승인 후 `createAuditLog({ adminId, SELLER_APPROVE,
  SELLER, sellerId })`.
- `AdminController.approveSeller`: `@CurrentUser().userId` → adminUserId 전달.
- `GET /admin/audit-logs`(AdminGuard) + `AdminService.listAuditLogs(limit)`(1..MAX 클램프).
- `AUDIT_ACTION.SELLER_APPROVE`·`AUDIT_TARGET.SELLER`·`DEFAULT/MAX_AUDIT_LOG_LIMIT(50/200)` 상수.

**제외(Out of Scope):**
- 판매자 승인 외 관리자 조치 감사(banner CRUD 등), 감사 기록 실패 격리/트랜잭션, 조회 HTTP e2e,
  cursor 페이지네이션·필터.

### [카테고리 4] 데이터 & 입출력

- `AdminAuditLog`: `id`(cuid PK)·`adminId`(String — users.users.id, FK 미선언)·`action`(String)·
  `targetType`(String)·`targetId`(String)·`createdAt`(`DateTime @default(now())`). 인덱스
  `(createdAt desc)`·`(adminId, createdAt desc)`. `@@schema("admin")`.
- `createAuditLog(data: { adminId; action; targetType; targetId }): Promise<AdminAuditLog>` —
  `adminAuditLog.create({ data })`.
- `listAuditLogs(take: number): Promise<AdminAuditLog[]>` — `findMany({ orderBy: { createdAt: 'desc' },
  take })`.
- `GET /admin/audit-logs?limit=` → `listAuditLogs(limit?)` (클램프 후 반환).

### [카테고리 5] 제약조건

Q5. 기술 스택 제약
- P-001: 모듈 경계 — `AdminRepository` 는 admin 스키마(`admin_audit_logs`)만 접근, 타 도메인은 Service DI.
- 호환성: 신규 테이블 추가(비파괴 `CREATE TABLE`). `action`·`targetType` String(확장성).
- 인증·인가: `GET /admin/audit-logs` JwtAuthGuard+AdminGuard(fail-closed). `adminId` 서버 확정.
- 신규 의존성 0. 환경변수 0.

### [카테고리 6] 예외 & 실패 시나리오

Q6. 엣지 케이스
- 감사 기록 실패 → 현재 try/catch 미적용이라 예외 전파(승인은 이미 커밋 — 원자성 아님). 후속 격리
  검토(GAP-013-02).
- `limit` 미지정·음수·초과 → 클램프(`1..MAX`, 미지정 시 DEFAULT).
- 판매자 승인 외 mutation → 현재 감사 미기록(범위 외 — GAP-013-01).
- `GET /admin/audit-logs` HTTP e2e 부재 → 가드 정적·기록/클램프 단위로 갈음(GAP-013-03).
