---
작성: Design Agent
버전: v1.0
최종 수정: 2026-06-29 21:19
상태: 확정 (retroactive)
---

# Research: 013-admin-audit-log

## 목차

- [분석 우선순위 게이트 결과](#분석-우선순위-게이트-결과)
- [선행 발견(007) 분석](#선행-발견007-분석)
- [기존 코드베이스 분석](#기존-코드베이스-분석)
  - [클래스·모듈 계층 구조](#클래스모듈-계층-구조)
  - [admin 모듈 기존 상태 (007)](#admin-모듈-기존-상태-007)
  - [영향 범위 분석 (호출 측 전수 목록)](#영향-범위-분석-호출-측-전수-목록)
- [영향 파일 목록](#영향-파일-목록)
- [String vs enum 결정 근거](#string-vs-enum-결정-근거)
- [감사 범위·기록 격리 결정](#감사-범위기록-격리-결정)
- [엣지 케이스 및 한계](#엣지-케이스-및-한계)

---

## 분석 우선순위 게이트 결과

- **변경 대상 모듈(plan §핵심 설계)**: `admin`(schema `AdminAuditLog` 추가, repository 빈 클래스 →
  create·list, service `approveSeller` 시그니처+감사·`listAuditLogs`, controller adminUserId 전달·
  audit-logs 라우트, constants 상수), `prisma/migrations`(013), `test/static/cross-schema`(규칙 주석).
  seller·user·banner·stats·order **변경 없음**.
- §A·B·C 분석은 admin.service·admin.repository·admin.controller·schema.prisma 로 한정.
- §D(다단계 병렬 파이프라인): 미해당.
- §E(동일 가드 결정 통합): 해당(인가) — `GET /admin/audit-logs` 는 `AdminController` 컨트롤러 레벨
  `@UseGuards(JwtAuthGuard, AdminGuard)`(007 기존)에 포섭되어 라우트별 가드 중복 선언 불필요.
- 외부 라이브러리 검증(§4): **신규 라이브러리 0건**. 기존 Prisma·`@prisma/client`·NestJS 가드만.
- §F(production 시그니처 변경): **해당** — `AdminService.approveSeller(sellerId)` →
  `approveSeller(adminUserId, sellerId)`(BREAKING — 호출 측 controller 1건 갱신). `AdminRepository`
  빈 클래스 → 메서드 추가(비파괴 — 의존 주입만 되어 있던 클래스에 메서드 신설).

---

## 선행 발견(007) 분석

> 007-banner-stats-admin 의 운영 추적 공백 GAP-007-01(관리자 액션 audit log 부재) — 013 이 해결 대상.

| 항목 | 007 상태 (공백) | 코드 근거 |
|---|---|---|
| 관리자 액션 audit log (GAP-007-01) | admin 모듈이 판매자 승인 등 관리자 조치를 수행하나 누가·언제·무엇을 했는지 기록하는 append-only 감사 로그 테이블 부재. `AdminRepository` 가 자체 테이블 없는 빈 클래스(007 ADR-004) | `admin.repository.ts`(007 빈 클래스), `admin.service.ts`(007 `approveSeller(sellerId)` — audit 없음), security-report.md A09 |

**거버넌스 공백(007)**: 관리자 조치가 도메인 Service 호출(`SellerService.approve`)로만 수행되어 audit
trail 이 남지 않았다. 단일 관리자 가정에서는 영향이 작으나, 다수 관리자 운영 시 "누가 이 판매자를
승인했는가"를 사후 추적할 방법이 없었다(보안 사고는 아니나 책임 추적 공백 — Low).

---

## 기존 코드베이스 분석

> context.md §2 핵심 모듈 목록을 기준선. 본 절은 변경 대상 한정 정밀 분석.

### 클래스·모듈 계층 구조

- **OOP 상속/추상 클래스 없음**: 변경 대상은 NestJS `@Injectable()` concrete 클래스(`AdminService`·
  `AdminRepository`)·`@Controller` (`AdminController`). DI 의존 추가 1건 — `AdminService` 가
  `AdminRepository` 를 주입(007 에서도 주입은 되어 있었음 — 빈 클래스).
- **schema 변경**: `admin` 스키마에 `AdminAuditLog` 모델 1종 추가(기존 `Banner` 모델과 동일 스키마).
  import·신규 패키지 없음.
- **마이그레이션**: `20260629121613_013_admin_audit_log/migration.sql`(`CREATE TABLE` + 인덱스 2종).

### admin 모듈 기존 상태 (007)

- `AdminService`(007): `listPendingSellers`·`approveSeller(sellerId)`·`listUsers` — 전부 도메인
  Service(`SellerService`·`UserService`) 조합. 자체 테이블 0.
- `AdminRepository`(007): **빈 클래스**(생성자만, 메서드 0 — ADR-004). DI 등록은 되어 있었으나 자체
  테이블이 없어 메서드가 없었다.
- `AdminController`(007): 컨트롤러 레벨 `@UseGuards(JwtAuthGuard, AdminGuard)`. `GET sellers/pending`·
  `POST sellers/:id/approve`·`GET users`.
- `admin.constants.ts`(007): `DEFAULT/MAX_USER_PAGE_LIMIT(20/100)` 만.

> 013 은 이 빈 `AdminRepository` 를 실 repository 로 채우고(admin 모듈 최초 자기 소유 테이블 접근),
> `approveSeller` 에 감사 기록을 더하며, `GET /admin/audit-logs` 라우트·`listAuditLogs` 를 추가한다.

### 영향 범위 분석 (호출 측 전수 목록)

- **`AdminService.approveSeller`(시그니처 변경)**: 호출 측은 `AdminController.approveSeller` 단일
  (grep 확인). 013 이 `@CurrentUser().userId` 를 첫 인자(adminUserId)로 전달하도록 갱신. `AdminService`
  외부에서 `approveSeller` 호출하는 다른 코드 없음 → BREAKING 잔여 참조 0.
- **`SellerService.approve`(불변)**: `approve(sellerId)` 시그니처 불변. admin 이 재사용하며 seller
  컨트롤러(`PATCH /sellers/:id/approve`, OBS-007-01)도 동일 메서드 호출(불변).
- **`AdminRepository`(빈 클래스 → 메서드 추가)**: `AdminService` 가 주입받아 `createAuditLog`·
  `listAuditLogs` 호출. `admin.service.spec` 에 `AdminRepository` mock provider 추가 필요(007 에는
  AdminRepository provide 없었음 — 빈 클래스라 미주입이었거나 미사용; 013 에서 mock provider 추가).

---

## 영향 파일 목록

| 파일 | 변경 유형 | 영향 내용 | 레이어 |
|---|---|---|---|
| `prisma/schema.prisma` | 수정 | `AdminAuditLog` 모델(append-only, 인덱스 2종) 추가(+20) | A |
| `prisma/migrations/20260629121613_013_admin_audit_log/migration.sql` | 신규 | `CREATE TABLE` + 인덱스 2종(+17) | A |
| `src/modules/admin/admin.repository.ts` | 수정 | 빈 클래스 → `createAuditLog`·`listAuditLogs`(+26 -4) | A |
| `src/modules/admin/admin.constants.ts` | 수정 | `DEFAULT/MAX_AUDIT_LOG_LIMIT`·`AUDIT_ACTION`·`AUDIT_TARGET`(+13) | A |
| `src/modules/admin/admin.service.ts` | 수정 | `approveSeller` 시그니처+감사·`listAuditLogs`(+37 -6) | B |
| `src/modules/admin/admin.controller.ts` | 수정 | adminUserId 전달·`GET /admin/audit-logs`(+16 -3) | C |
| `src/modules/admin/admin.service.spec.ts` | 수정 | approveSeller 단언 갱신 + listAuditLogs describe 2건(+39 -3, +2 it()) | D |
| `test/static/cross-schema.spec.ts` | 수정 | AdminRepository 규칙 주석·label(007→007/013)(+3 -3, 신규 it() 0) | D |

> `seller/*`·`user/*`·`order/*`·`banner/*`·`stats/*`·`package.json` 변경 0건.

---

## String vs enum 결정 근거

- **확장성 우선(String 채택)**: `action`·`targetType` 을 Prisma enum 으로 정의하면 새 조치 종류
  (BANNER_DELETE 등)·대상(BANNER·USER)을 추가할 때마다 enum 변경 마이그레이션이 필요하다. String 으로
  저장하고 값을 `AUDIT_ACTION`·`AUDIT_TARGET` 상수(`admin.constants.ts`)로 관리하면, 향후 감사 대상을
  확장할 때 코드 상수만 추가하고 DB 마이그레이션은 불필요하다(ADR-002).
- **타입 안전성 보완**: enum 의 컴파일 타임 안전성은 포기하나, 기록 측이 상수(`AUDIT_ACTION.SELLER_
  APPROVE`)를 사용하므로 오타·임의값 주입 표면은 제한된다. 조회 측은 String 그대로 반환(필터 없음 —
  현재 단순 최신순).
- **현재 값 집합**: `AUDIT_ACTION = { SELLER_APPROVE }`, `AUDIT_TARGET = { SELLER }`. 013 의 감사 대상이
  판매자 승인 1종이므로 값도 각 1종이다(GAP-013-01 — 확장 시 상수 추가).

---

## 감사 범위·기록 격리 결정

### 감사 대상 1종 한정 (ADR-003)

- 013 은 007 GAP 의 대표 사례인 **판매자 승인**부터 감사한다. banner CRUD·기타 관리자 mutation 의 감사는
  본 차수 범위 외다(GAP-013-01). 확장 방식 후보:
  - (a) 각 도메인 mutation 에서 `AdminService.recordAudit(...)` 직접 호출(명시적, 결합 증가).
  - (b) 도메인 이벤트(`banner.deleted` 등) 구독 핸들러에서 감사 기록(009 NotificationEventsHandler 와
    동형 패턴 — 결합 낮음, 비동기).
  - 어느 방식이든 `action`·`targetType` String·상수 확장으로 수용 가능하다.

### 기록 격리·원자성 (ADR-004 — 한계)

- 현재 `approveSeller` 는 `sellerService.approve(sellerId)` → `adminRepository.createAuditLog(...)` 를
  **순차 await** 하며 단일 `$transaction` 으로 묶지 않는다.
  - **승인 롤백 안 함(기록 순서)**: 승인이 먼저 커밋된 뒤 감사가 append 되므로, 감사 기록 실패가 이미
    완료된 승인을 되돌리지 않는다.
  - **원자성 아님(예외 전파)**: try/catch 가 없어 `createAuditLog` 가 throw 하면 그 예외가 호출 측
    (controller → 500)으로 전파된다. 승인은 성공했으나 요청은 오류로 표면화되는 경계가 존재한다.
  - 후속 검토: try/catch 로 감사 실패를 흡수(승인 성공을 그대로 반환)하거나, `$transaction` 으로 승인+
    감사를 원자화(감사 실패 시 승인도 롤백)하는 방향(GAP-013-02). 어느 쪽이 맞는지는 "감사 실패 시
    승인을 유지할 것인가"라는 정책 결정에 달려 있어 본 차수에서는 단순화(현 동작 유지)했다.

---

## 엣지 케이스 및 한계

- **AdminGuard fail-closed 상속**: `GET /admin/audit-logs` 는 라우트별 가드를 선언하지 않고 `AdminController`
  컨트롤러 레벨 `@UseGuards(JwtAuthGuard, AdminGuard)` 에 포섭된다(007 기존). `ADMIN_USER_IDS` 미설정/
  미포함 시 403(fail-closed) — 비관리자 조회 차단.
- **limit 클램프 경계**: `listAuditLogs(limit)` 는 `min(max(limit ?? 50, 1), 200)` 로 클램프한다. 음수·0
  → 1, 미지정 → 50, 초과 → 200. 007 사용자 목록 클램프와 동형이다.
- **append-only 위변조 표면**: `AdminRepository` 는 `create`·`findMany` 만 노출하고 `update`·`delete` 를
  제공하지 않는다. 애플리케이션 경로로 감사 로그를 수정·삭제할 수 없다(DB 직접 접근은 별도 권한 문제 —
  본 spec 범위 외).
- **조회 HTTP e2e 부재(한계)**: `GET /admin/audit-logs` 의 관리자 200·비인증 401·비관리자 403 을 HTTP
  end-to-end 로 검증하는 통합 테스트가 없다. 가드는 정적(SC-003), 기록·클램프는 단위(SC-001·002)로
  검증한다(GAP-013-03, coverage-gap.md).

가정-실제 불일치 현재 미발견.
