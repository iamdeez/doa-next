---
작성: Spec Agent
버전: v1.0
최종 수정: 2026-07-04 06:56
상태: 확정
---

# Spec Input: 019-security-quality-followups
> 수집 일시: 2026-07-04 06:56 [시각 미확인, spawn 기준 06:56 anchor — pipeline-log.md "단계 시작" 이벤트 값 재사용] | 사용자 최종 확인: 완료(사전 확정된 Task 지시 기반)

## 수집 진행 상태

> 본 spec은 main session이 사전에 사용자와 협의하여 4개 해소 대상(SEC-017-01·GAP-017-03·SEC-018-02·SEC-018-03)과 각 항목의 "해소:" 방향을 이미 확정한 상태로 Task에 전달했다. Spec Agent는 이 지시와 context.md §6·017/018 security-report.md·실제 코드(schema.prisma·admin.controller.ts·product.controller.ts·auth.service.ts·app.module.ts·security-audit.logger.ts)를 대조 검증하여 7개 카테고리 질문에 대한 답을 코드 근거와 함께 재구성했다. 별도 사용자 재질문 없이 모든 카테고리를 "완료" 처리할 수 있는 충분한 근거를 확보했다(모호성 0건 — 세부 판단 근거는 아래 "질문 분석 근거" 참조).

| 카테고리 | 상태 | 마지막 질문 번호 | 답변 완료 항목 |
|---|---|---|---|
| 1. 배경 및 목적 | 완료 | Q3 | [Q1, Q2, Q3] |
| 2. 사용자 & 이해관계자 | 완료 | Q6 | [Q4, Q5, Q6] |
| 3. 핵심 기능 | 완료 | Q9 | [Q7, Q8, Q9] |
| 4. 데이터 & 입출력 | 완료 | Q12 | [Q10, Q11, Q12] |
| 5. 제약조건 | 완료 | Q16 | [Q13, Q14, Q15, Q16] |
| 6. 운영 환경 | 완료 | Q19 | [Q17, Q18, Q19] |
| 7. 예외 & 실패 시나리오 | 완료 | Q22 | [Q20, Q21, Q22] |

## 기존 working tree 수정 cross-reference (§핵심 원칙 11 / A-0)

> **도구 제약 고지**: 본 세션에는 Bash 도구가 제공되지 않아 `git status`/`git diff HEAD --stat`를 직접 실행할 수 없었다. 대신 세션 시작 시 시스템이 제공한 `gitStatus` 스냅샷(브랜치 `feat/social-login-oauth`, 최근 커밋 `6b64c24` 등)을 근거로 사용했다.

- 현재 working tree 수정 파일 목록(gitStatus 스냅샷 기준): `.claude/docs/context.md`·`.claude/docs/infra.md`·`apps/backend/.env.example`·`apps/backend/prisma/schema.prisma`·`apps/backend/src/modules/auth/*`(auth.constants/controller/module/repository·dto 2종)·`apps/backend/src/modules/auth/social-auth.service*.spec.ts`·`apps/backend/src/modules/auth/social/naver.provider.ts`·`social-provider.port.ts`·`social-provider.resolver.ts`·`docs/specs/v1.1.0/CHANGES.md`·`mobile/customer_app/**`(providers·login_screen·social_auth_service·test) + 신규 미추적 파일(`015-naver-code-exchange/`·`016-naver-state-redirect-hardening/` 산출물, `oauth-state.service.ts` 등).
- **판정**: 위 전 파일은 브랜치명(`feat/social-login-oauth`)·내용(네이버 code-exchange·state CSRF 하드닝) 모두 **015/016 spec(소셜 로그인 트랙)의 미커밋 산출물**이며, 본 019 spec의 대상(SEC-017-01 cursor DTO·GAP-017-03 인덱스·SEC-018-02 감사 로그·SEC-018-03 pino redact)과 **파일 경로가 전혀 겹치지 않는다**(019 대상 파일: `admin.controller.ts`/`admin.service.ts`/`product.controller.ts`/`prisma/schema.prisma`의 Product·Seller 모델부·`auth.service.ts`의 `findEmail`·`app.module.ts`의 `LoggerModule.forRoot` — 이 중 `schema.prisma`만 working tree에 이미 수정 상태로 존재하나 015/016은 `oauth_states` 테이블 변경이고 019는 `Product`/`Seller` 모델 인덱스 변경으로 **모델이 다름**, 병합 충돌 가능성 낮음).
- **결정**: 통합 대상 아님(옵션 B) — 본 spec 범위 외. 015/016 작업자가 별도로 커밋 처리할 사안이며, 019는 그 위에 독립적으로 `schema.prisma`를 추가 수정한다(같은 파일이지만 다른 모델 블록).

## 질문 분석 근거 (Question Analysis Basis)

| 질문 ID | 요지 | 옵션별 근거·trade-off | 추천안(이유) | 채택 결과 |
|---|---|---|---|---|
| Q9-a (SEC-017-01 적용 범위) | cursor 목록 API DTO 전환 대상을 Task가 명시한 2곳(`admin/sellers/pending`·`sellers/me/products`)으로 한정할지, 007 기원 2곳(`admin/users`·`admin/audit-logs`)까지 4곳으로 확장할지 | A(2곳 한정): Task 문구를 문자 그대로 준수, 범위 최소화(P-007 스펙 범위 원칙에 안전). B(4곳 확장): `admin.controller.ts` 실코드 확인 결과 `listUsers`·`listAuditLogs` 두 메서드도 **동일한 `@Query('cursor')`/`@Query('limit')` + 수동 `parseInt` 패턴**을 그대로 사용 중(017 security-report SEC-017-01 권고사항 1항이 명시적으로 "동일 패턴을 사용하는 admin/users·admin/audit-logs(007-admin, 017 범위 밖)도 함께 정정하는 것이 일관성 측면에서 바람직" 이라고 이미 권고). Task 원문의 "admin/sellers/pending·sellers/me/products **등**"의 "등"은 동일 컨트롤러 내 동일 패턴 2곳을 지칭하는 것으로 해석 가능 | B (4곳 확장) — 코드 근거(동일 controller, 동일 anti-pattern, 동일 위험도 Low, 동일 해법 `ListXxxDto` 재사용)로 뒷받침되고, 017 Security Agent가 이미 명시적으로 "일관성" 근거의 확장 적용을 권고했으며, 순수 입력 검증 강화(behavior 변경 없음, 유효 입력 200 응답 불변)라 스펙 범위 일탈 위험이 낮음 | **B 채택** — FR-001~FR-004가 4개 엔드포인트 전부를 대상으로 함(admin/sellers/pending·admin/users·admin/audit-logs·sellers/me/products) |
| Q13-a (GAP-017-03 마이그레이션 적용 범위) | 인덱스 추가를 로컬 개발 DB(schema.prisma + migration 파일)까지만 다룰지, 실 운영 배포 적용까지 spec 범위에 포함할지 | A: schema.prisma 변경 + `prisma migrate dev`로 신규 마이그레이션 생성·로컬 적용까지만 spec 범위(운영 배포는 Deploy Agent/후속 배포 절차가 표준 `migrate deploy`로 자동 적용). B: 운영 DB 접속·수동 적용까지 spec에 포함 | A — context.md 기준 프로젝트가 아직 Stage 1~3(로컬/CI 중심, `fly.toml` 미존재)이므로 "운영 배포"라는 별도 환경이 코드베이스 관점에서 존재하지 않음. 기존 15차례 마이그레이션 모두 동일 패턴(신규 마이그레이션 파일 생성 + 로컬 적용 + CI 통과)으로 처리됨 | **A 채택** — SC는 schema.prisma 정적 확인 + 로컬 DB EXPLAIN 검증까지로 한정 |

## 카테고리별 수집 내용

### [카테고리 1] 배경 및 목적

- **Q1 (문제)**: 017/018 spec의 보안·성능 감사에서 식별된 4건의 비블로킹(Low~Info) 코드 수준 후속 부채가 `context.md §6`에 미해소 상태로 누적되어 있다. (1) 관리자·판매자 cursor 목록 API가 수동 `parseInt`로 전역 `ValidationPipe`를 우회해 비정수 입력 시 500을 유발할 수 있음(SEC-017-01). (2) `Product.sellerId`·`Seller.status` 조회에 뒷받침 인덱스가 없어 Seq Scan이 발생하며 데이터 증가 시 확장성 저하(GAP-017-03). (3) `findEmail` 실패(미등록 전화번호) 케이스가 감사 로그에 남지 않아 enumeration 시도 탐지 사각지대 존재(SEC-018-02). (4) pino 요청 로그에 `redact` 설정이 없어 Authorization/Cookie 헤더(JWT)가 평문 로깅될 가능성(SEC-018-03).
- **Q2 (기존 해결 방식의 한계)**: 4건 모두 Security/Performance Agent가 "비블로킹" 판정으로 열어둔 채 각 spec을 완료시켰다(017 SC PASS, 018 gate PASS). 이후 신규 spec이 해당 파일들을 다시 건드리지 않는 한 자연 해소되지 않고 `context.md §6`에 누적 부채로 잔존한다.
- **Q3 (성공 판단 기준)**: `context.md §6`의 SEC-017-01·GAP-017-03·SEC-018-02·SEC-018-03 4개 행이 전부 "RESOLVED (019-security-quality-followups)"로 갱신 가능한 수준까지 코드·마이그레이션이 적용되고, 전체 테스트(unit/e2e/static)가 회귀 없이 PASS 하는 것.

### [카테고리 2] 사용자 & 이해관계자

- **Q4 (사용자)**: 직접 사용자 대면 기능 변경은 없음(내부 API 견고성·감사·로그 보안 개선). 이해관계자는 (a) 관리자 콘솔·판매자 콘솔 API 소비자(잘못된 쿼리 파라미터 시 명확한 400 응답을 받는 클라이언트 개발자), (b) 백엔드 운영자(DB 확장성·감사 추적성 확보), (c) 보안 담당자(토큰 평문 로깅 위험 제거).
- **Q5 (기술 수준)**: 콘솔·앱 클라이언트는 기존에도 정상 정수 limit/cursor만 전송하므로 변경 체감 없음. 비정상 입력(디버깅 도구로 임의 쿼리 전송 등) 시에만 응답 코드가 500→400으로 바뀜.
- **Q6 (영향받는 이해관계자)**: 신규 이해관계자 없음. 기존 admin·seller 콘솔 API 소비자, 백엔드 운영팀.

### [카테고리 3] 핵심 기능

- **Q7 (필수 기능, 우선순위순)**:
  1. SEC-017-01 — `admin/sellers/pending`·`admin/users`·`admin/audit-logs`·`sellers/me/products` 4개 cursor 목록 엔드포인트의 `limit`/`cursor` 쿼리 파라미터를 class-validator DTO(`ListProductsDto` 패턴 재사용)로 검증.
  2. GAP-017-03 — `Product` 모델에 `sellerId` 선두 복합 인덱스, `Seller` 모델에 `status` 선두 복합 인덱스 추가(신규 Prisma 마이그레이션).
  3. SEC-018-02 — `findEmail` 실패(미등록 전화번호, `NotFoundException`) 케이스에 대해 `SecurityAuditLogger`에 신규 이벤트(예: `findEmailNotFound`) 추가, best-effort·마스킹 원칙 승계.
  4. SEC-018-03 — `app.module.ts`의 `LoggerModule.forRoot({ pinoHttp })`에 `redact: ['req.headers.authorization', 'req.headers.cookie']` 설정 추가.
- **Q8 (있으면 좋지만 필수 아님)**: 없음(4건 모두 Task에 필수로 명시됨).
- **Q9 (명시적 제외, Out of Scope)**:
  - SEC-018-01(Medium, rate limit 클라이언트 헤더 신뢰 미검증) — `infra.md` 문서화 + PROC-014 사후 운영 검증(외부 크레덴셜·실 배포 환경 필요) 대상이라 "코드-only" 범위인 본 spec에서 제외(사용자 확정).
  - `apps/worker`(pg-boss 별도 프로세스) — 사용자 드롭 확정(Task 명시).
  - "트랙 B" 관련 기타 항목 — Task가 "트랙 C 보안·품질 후속"으로 범위를 4건에 한정, 트랙 B는 범위 외.
  - 운영(prod) 배포 환경에 대한 마이그레이션 실 적용 — Stage 1~3 범위(로컬/CI)로 한정(위 "질문 분석 근거" Q13-a 참조).

### [카테고리 4] 데이터 & 입출력

- **Q10 (주요 데이터)**: 관리자/판매자 목록 조회 쿼리 파라미터(`limit`·`cursor`·`status`·`q`), `Product`/`Seller` 테이블 인덱스 메타데이터, 보안 감사 로그 이벤트(전화번호 마스킹), HTTP 요청/응답 로그(Authorization·Cookie 헤더).
- **Q11 (외부 연동)**: 없음. 순수 내부 PostgreSQL(Prisma)·pino 로깅 변경.
- **Q12 (민감도)**: 감사 로그의 전화번호는 기존 `maskPhone` 패턴으로 마스킹 유지(PII). Authorization/Cookie 헤더는 JWT 토큰(자격증명)이므로 redact 필수 대상.
- **Q12-1 (목록 응답 요약 필드)**: 해당 없음 — 본 spec은 목록 응답 바디 형식(`{items, nextCursor}` 등)을 변경하지 않는다. 쿼리 파라미터 검증 계층만 추가(입력 검증 강화, 응답 스키마 불변).

### [카테고리 5] 제약조건

- **Q13 (기술 스택 제약)**: 기존 `class-validator`/`class-transformer`(전역 `ValidationPipe`, `whitelist`/`forbidNonWhitelisted`/`transform`) 재사용. 신규 의존성 추가 없음(P-002 AWS 의존 금지·P-003 단일 DB 원칙과 무관, 기존 스택 내). Prisma 마이그레이션은 기존 15차 마이그레이션과 동일한 `prisma migrate dev` 워크플로우.
- **Q14 (일정 제약)**: 없음(별도 명시 없음).
- **Q15 (성능 요구사항, 수치)**: 신규 인덱스 적용 후 `WHERE "sellerId" = $1 ORDER BY "createdAt" DESC, id DESC`·`WHERE status = $1 ORDER BY "createdAt" DESC, id DESC` 두 쿼리의 `EXPLAIN` 결과가 Seq Scan에서 인덱스 스캔으로 전환되어야 한다(GAP-017-03 근거). 기존 NFR-001(P95 500ms) 자체는 이미 PASS 상태(GAP-017-03 기록: 실측 P95 3~4ms)이므로 본 spec은 이 수치를 유지하며 확장성 대비 인덱스만 추가한다.
- **Q16 (보안/법규 요구사항)**: JWT 토큰(Authorization/Cookie) 로그 평문 노출 금지(SEC-018-03), PII(전화번호) 마스킹 유지(SEC-018-02, 기존 `maskPhone` 재사용), 쿼리 파라미터 비정수 입력에 대한 명시적 400 응답(정보 노출 없는 예측 가능한 오류 처리, SEC-017-01).

### [카테고리 6] 운영 환경

- **Q17 (실행 환경)**: Fly.io 배포 대상 NestJS 모놀리스(`apps/backend`), 로컬 개발은 `docker-compose.yml`의 PostgreSQL 16. 본 spec의 4개 변경 모두 순수 애플리케이션 레벨(HTTP DTO 검증·DB 인덱스·로깅 설정)로, 컨테이너 NAT·docker-proxy·L4 LB·방화벽·커널 keepalive 등 배포 인프라 특이성과 상호작용하는 지점이 없다(PROC-009 판단: 영향 가능성 낮음 — Kafka 재연결류 네트워크 계층 이슈와 무관, DB 스키마·로깅 설정·입력 검증은 인프라 토폴로지 독립적).
  - **배포 환경 cross-reference 결과**: infra.md 심층 열람 불요로 판단(위 근거). 신규 인덱스는 표준 `prisma migrate deploy` 경로로 적용되며 별도 인프라 변경 없음. `[NEEDS CLARIFICATION]` 대상 아님.
- **Q18 (사용자 수·데이터 규모)**: 현재 로컬/CI 규모(products 9건·sellers 1건 수준, GAP-017-03 기록). 인덱스는 향후 데이터 증가 대비 선제 조치.
- **Q19 (배포·운영 담당)**: 기존과 동일 — 프로젝트 개발팀(CI `.github/workflows/ci.yml` lint→typecheck→test→docker build 경유).

### [카테고리 7] 예외 & 실패 시나리오

- **Q20 (실패 시 기대 동작)**: (1) cursor 목록 API에 비정수/범위초과 `limit` 전달 시 500이 아닌 400 Bad Request(명확한 클라이언트 오류)를 반환해야 한다. (2) 감사 로거 내부 예외가 발생해도 `findEmail` 원 요청 흐름(404 반환)이 차단되지 않아야 한다(기존 3종 이벤트와 동일한 best-effort try/catch 원칙 승계, FR-010 패턴).
- **Q21 (엣지 케이스)**: `limit` 미지정(기존 기본값 유지) · `limit=0`/`limit=101`(경계값, 상한 100 초과) · `cursor` 빈 문자열 · Authorization 헤더 없는 요청(redact 설정이 정상 요청에 부작용 없어야 함) · 미등록 전화번호 대량 반복 조회(신규 감사 이벤트가 rate limit 5/60s와 함께 이중 방어선 형성).
- **Q22 (백업/복구 요구사항)**: 해당 없음 — 스키마 변경은 인덱스 추가뿐(컬럼·테이블 변경 없음, 데이터 손실 위험 없음, 롤백 시 인덱스 DROP만으로 원복 가능).

## 보완 내용

- SEC-017-01 적용 대상은 "질문 분석 근거 Q9-a"에 따라 4개 엔드포인트(`admin/sellers/pending`·`admin/users`·`admin/audit-logs`·`sellers/me/products`)로 확정.
- GAP-017-03 인덱스는 기존 `Product.@@index([status, createdAt(sort: Desc), id(sort: Desc)])`·`InventoryLog` 등의 기존 복합 인덱스 명명 패턴과 동일한 구조(`@@index([sellerId, createdAt(sort: Desc), id(sort: Desc)])`, `@@index([status, createdAt(sort: Desc), id(sort: Desc)])` on Seller)로 통일.
- 신규 마이그레이션 폴더명은 기존 컨벤션(`YYYYMMDDHHMMSS_설명`)을 따른다(Planning/Design 단계에서 확정 — spec.md는 HOW 미포함).
