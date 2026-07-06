---
작성: Security Agent
버전: v1.0
최종 수정: 2026-07-05 18:35
상태: 확정
---

# 보안 감사 결과

## 검토 범위

DIFF-019-security-quality-followups.md (base commit `62d14f9`) 기준 변경 파일 전수.

- `apps/backend/src/modules/admin/admin.controller.ts` (DTO 전환·`@SkipThrottle`)
- `apps/backend/src/modules/admin/dto/admin-seller-list-query.dto.ts` (신규)
- `apps/backend/src/modules/product/product.controller.ts` (DTO 전환·`@SkipThrottle`)
- `apps/backend/src/shared/dto/list-query.dto.ts` (신규)
- `apps/backend/src/modules/auth/auth.service.ts` (`findEmail` 404 분기 감사로그)
- `apps/backend/src/shared/security/security-audit.logger.ts` (`findEmailNotFound` 신규)
- `apps/backend/src/app.module.ts` (pino `redact` 설정)
- `apps/backend/src/shared/prisma/prisma.service.ts` / `prisma.module.ts` (tx delegate fix, GAP-019-03)
- `apps/backend/prisma/schema.prisma` (인덱스 전용 — 컬럼/관계 변경 없음, 보안 영향 없음으로 제외)
- 신규 테스트 6개 (`list-query-dto.e2e-spec.ts`·`pino-redact.e2e-spec.ts`·`prisma.service.spec.ts`·`list-index.spec.ts`·`admin.controller.spec.ts`·`auth.service.spec.ts` 증분) — 감사 대상 코드의 검증 근거로만 참조, 별도 취약점 스캔 대상 아님.

**제외 파일**: `docs/specs/v1.1.0/CHANGES.md`(문서, 보안 무관), 마이그레이션 SQL(인덱스 전용, DDL 인젝션 표면 없음).

## 요약

- 대상 파일 7개(schema.prisma 제외 실질 로직 변경 파일)
- Critical/High: **0건**
- 전체 발견 항목: 0건 신규 취약점. 재감사 대상 3건 모두 RESOLVED, 신규 회귀 감사 2건(T016/T017) 모두 이상 없음(CONFIRMED 안전)

## Constitution 보안 조항 이행 현황

`{project}/.claude/docs/constitution.md`에 별도 P-XXX 보안 전용 조항 없음(P-005 결제 정합성이 트랜잭션 관련 근접 조항). T016(tx delegate fix)이 트랜잭션 내부 경로(`store.client`)를 불변으로 유지함을 코드 확인(`prisma.service.ts` L38~41) — P-005 위반 없음.

| 조항 | 이행 여부 | 비고 |
|---|---|---|
| P-005 (결제 트랜잭션 정합성) | 이행 | tx 내부 경로(`this.als.getStore()?.client`) 최우선 반환 순서 불변, `payment`/`settlement` 모듈 코드 무변경 |

## 취약점 목록

신규 Critical/High/Medium 취약점 없음. 아래는 재감사 대상 3건 + 신규 회귀 감사 2건의 판정 결과다.

### SEC-017-01 — cursor 목록 API `@Query()` 파라미터 미검증 (017/018 report, Low·비블로킹)

- **OWASP**: A03:2021 (인젝션) / A04:2021 (안전하지 않은 설계) — 입력 검증 부재
- **위치**: `admin.controller.ts` L41(`listPendingSellers`)·L65(`listUsers`)·L73(`listAuditLogs`), `product.controller.ts` L59(`listMyProducts`)
- **판정**: **RESOLVED**
- **근거**:
  - 4개 엔드포인트 전부 `@Query() query: ListQueryDto` 또는 `AdminSellerListQueryDto`(class-validator, `@IsInt @Min(1) @Max(100)` on `limit`)로 전환. `parseInt`/`Number()` 수동 파싱 잔존 0건(grep 확인).
  - `main.ts` 전역 `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` 적용 — 미선언 파라미터는 400으로 거부(`AdminSellerListQueryDto`가 `status`·`q`·`cursor`·`limit` 4개 모두 선언해 기존 유효 요청 회귀 없음, ADR-002 확인).
  - `status`·`q`(`AdminSellerListQueryDto`)는 `@IsString()`만 적용되나, 서비스 레이어(`AdminService.listSellers` → `resolveSellerStatus`)가 enum 매핑을 수행하고 Prisma가 전 구간 파라미터화 쿼리를 사용(raw SQL 사용처 0건, grep 확인) — 인젝션 표면 없음.

### SEC-018-02 — find-email enumeration 탐지 로그 부재 (018 report, Low)

- **OWASP**: A09:2021 (보안 로깅 및 모니터링 실패)
- **위치**: `auth.service.ts` L295~303(`findEmail`)
- **판정**: **RESOLVED**
- **근거**: `findEmail` 404 분기(`NotFoundException` throw 이전, L298)에서 `securityAuditLogger.findEmailNotFound(phone)` 호출 확인. `security-audit.logger.ts` L49~58 — 기존 3개 이벤트(`otpVerificationFailed`·`rateLimitExceeded`·`findEmailAccessed`)와 동일한 best-effort try/catch 패턴, `maskPhone()` 마스킹 적용(원본 전화번호 미기록). `auth.service.spec.ts` SC-011(호출 1회·인자 확인)·SC-013(로거 throw 시에도 404 응답 불변) 단위 테스트로 회귀 방지 확인.

### SEC-018-03 — HTTP 요청 로그 JWT/토큰 평문 노출 (018 report, Low)

- **OWASP**: A02:2021 (암호화 실패, 민감정보 노출) / A09:2021 (로깅 실패)
- **위치**: `app.module.ts` L32~40(`LoggerModule.forRoot`)
- **판정**: **RESOLVED**
- **근거**: `pinoHttp.redact: ['req.headers.authorization', 'req.headers.cookie']` 확인(L34). `test/pino-redact.e2e-spec.ts` SC-014/015가 `[Redacted]` 마커 존재 + 원본 토큰/쿠키 문자열 부재를 stdout 캡처로 실증(PASS, GAP-019-01 canonical 하네스 적용).
- **잔여 확인 사항(비블로킹)**: redact 경로는 **요청 헤더**(`req.headers.*`)만 커버한다. 코드베이스 전수 확인 결과(`grep -rn "res.cookie\|Set-Cookie" src`) 응답에 쿠키를 설정하는 경로가 존재하지 않음(리프레시 토큰은 응답 바디로 반환, 쿠키 미사용) — 현재 아키텍처에서 응답측 노출 표면 없음. 향후 쿠키 기반 세션·리프레시 토큰 도입 시 `res.headers['set-cookie']` redact 경로 추가 필요(권고사항 참조).

### T016 — `PrismaService.tx` 트랜잭션 delegate 상실 fix (GAP-019-03) 보안 회귀 감사

- **판정**: **회귀 없음 (CONFIRMED 안전)**
- **점검 내용**:
  - `prisma.service.ts` `get tx()`(L38~41) — 우선순위 `this.als.getStore()?.client ?? this.rootClient ?? (this as unknown as TxClient)`. **트랜잭션 내부 경로(`store.client`)가 최우선으로 완전 불변** — `AsyncLocalStorage` 기반 요청/트랜잭션 격리 메커니즘 자체는 변경되지 않았으므로 트랜잭션 경계·감사로그 원자성에 부작용 없음.
  - `registerRootClient()`는 `prisma.module.ts`의 `useFactory` 내부에서 부트스트랩 시점 **1회만** 호출(L10~12) — 동시성 위험 없음(단일 write, 이후 read-only), 외부(HTTP 레이어)에서 도달 가능한 경로 없음(공개 메서드이나 DI 컨테이너 외부 호출 불가, 컨트롤러·서비스 어디서도 미참조 확인).
  - `rootClient`는 DI가 관리하는 동일 싱글톤 Proxy 자기 자신을 참조 — 테넌트/요청 간 데이터 격리를 우회하거나 새로운 신뢰 경계를 만들지 않음. 결제(`payment`/`settlement`) 모듈 코드 무변경.

### T017 — GET 목록/조회 8핸들러 `@SkipThrottle()` 부착 (GAP-019-04) 보안 회귀 감사

- **판정**: **회귀 없음 (CONFIRMED 안전)**
- **전수 확인(grep, 019 변경 파일 한정)**:
  - `admin.controller.ts`: `@SkipThrottle()` 3건 — `listPendingSellers`(GET)·`listUsers`(GET)·`listAuditLogs`(GET). `approveSeller`(POST, L51~58)는 **미부착** — mutating 엔드포인트 rate limit 유지 확인.
  - `product.controller.ts`: `@SkipThrottle()` 5건 — `listCategories`·`listMyProducts`·`getMyProductDetail`·`listPublic`·`getDetail`(전부 GET). `createProduct`·`updateProduct`·`publish`·`deactivate`·`addVariant`·`updateVariant`·`deleteVariant`·`addImage`·`deleteImage`(POST/PATCH/DELETE, 9건) 전부 **미부착**.
  - 컨트롤러 레벨 `@SkipThrottle()` 오적용(혼재 컨트롤러 rate-limit 완전 제거 위험) — **0건**, 전부 메서드 레벨 부착으로 확인(design ADR-007 "혼재 컨트롤러 컨트롤러 레벨 금지" 준수).
  - `auth.controller.ts`(019 미변경, 대조군): `@Throttle` 5건(social-login·naver-state·forgot-password·reset-password·find-email) 전부 유지, `@SkipThrottle` 0건 — auth 경로 rate limit 무손상 확인.
  - `health.controller.ts`의 `@SkipThrottle()`은 018 이전부터 존재하는 헬스체크 예외로 019 변경분 아님(참고용, 대상 외).
- **인가(authorization) 영향 확인**: rate-limit 완화는 인증/인가 가드와 독립적인 별도 `APP_GUARD`(`FlyThrottlerGuard`) 레이어이며, `@SkipThrottle()`은 이 가드만 우회한다. `AdminController`는 클래스 레벨 `@UseGuards(JwtAuthGuard, AdminGuard)`(L30) 불변, `SellerProductController`는 클래스 레벨 `@UseGuards(JwtAuthGuard)`(L49) 불변 — GET 3건·5건 모두 인증/인가 가드가 rate-limit 완화와 무관하게 그대로 적용됨을 확인. **rate-limit 완화가 인가 우회로 이어지지 않음**.
- **DoS/열거 스캐닝 노출 평가**:
  - `GET /products`·`GET /products/:id`·`GET /categories`: 원래 공개(비인증) 엔드포인트로 rate-limit 여부와 무관하게 공개 조회이며, plan.md 설계 근거(read=멱등 조회, brute-force/enumeration 위험 클래스 밖) 타당. Fly.io 엣지 레벨 완화는 인프라 범위(본 감사 범위 밖).
  - `GET /sellers/me/products`·`GET /sellers/me/products/:id`: JWT 인증 필요 — 무제한 스캐닝은 유효 세션 보유가 전제이며, 소유권 스코핑(`user.userId` 필터, plan.md 확인)으로 본인 데이터만 노출.
  - `GET /admin/*` 3건: JWT+AdminGuard 이중 가드 — 공격 표면은 이미 인증된 admin 계정 탈취 시나리오로 한정되며, rate-limit 완화가 이 시나리오의 위험도를 유의미하게 증가시키지 않음(admin 계정 탈취 자체가 더 큰 위협).
  - **종합 판정**: rate-limit 완화로 인한 신규 DoS/열거 위험은 Low 수준이며 mutating/auth 경로가 strict 유지되어 NFR-001~006(rate-limit 원본 보안 요구사항)의 핵심 목적(brute-force·자원변경 남용 차단)은 훼손되지 않음.

## NFR-XXX / SC-XXX 보안 요구사항 이행 현황

| ID | 요구사항 | 이행 여부 | 비고 |
|---|---|---|---|
| NFR-004 | FR-008~012 변경이 기존 인증(JWT)·인가(AdminGuard 등) 로직 동작 불변 | 이행 | `AdminGuard`/`JwtAuthGuard` 컨트롤러 레벨 데코레이터 무변경 확인. SC-016 단위 테스트 회귀 0 |
| SC-011~013 | find-email 감사로그 신규(마스킹·best-effort) | 이행 | 코드·테스트 교차 확인 |
| SC-014~015 | pino redact(Authorization/Cookie) | 이행 | e2e 실증(GAP-019-01 하네스) |
| SC-016 | redact 적용 후 인증/인가 테스트 회귀 없음 | 이행 | `rate-limit.e2e-spec.ts` 6/6 PASS(mutating/auth 임계값 불변, test-report.md 참조) |

## 권고사항

1. **(비블로킹, 향후 아키텍처 변경 시 적용)** 응답측 `Set-Cookie` 헤더를 통한 세션/리프레시 토큰 발급 방식을 향후 도입할 경우, `pinoHttp.redact`에 `res.headers['set-cookie']` 경로를 추가해야 한다. 현재는 쿠키 미사용 구조라 노출 표면이 없으나, 향후 provider 재도입 시 누락되기 쉬운 항목이므로 도입 시점에 별도 확인이 필요하다.
2. **(정보성)** `PrismaService.registerRootClient()`는 public 메서드이나 실제로는 `prisma.module.ts` useFactory 내부 부트스트랩 1회 호출로만 도달 가능하며 HTTP 레이어에서 접근 불가능한 것을 확인했다. 별도 조치 불필요하나, 향후 리팩토링 시 이 메서드가 컨트롤러/서비스에서 임의 호출되지 않도록(즉 DI 팩토리 전용 계약 유지) 주의가 필요하다.
3. **(context.md §6 등재는 Docs/Retrospective 소관)** 본 감사에서 발견된 Critical/High/Medium 이상 미해결 신규 취약점 없음 — GAP-019-01/02/04/05는 전부 테스트 하네스·문서 갱신 성격이며 보안 취약점이 아니므로 본 항목에서 별도 context.md §6 등재 권고를 추가하지 않는다(기존 gaps.md 처리로 충분).
