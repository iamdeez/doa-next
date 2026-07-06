---
작성: Spec Agent
버전: v1.0
최종 수정: 2026-07-04 [시각 미확인, spawn 기준 03:39]
상태: 확정
---

# Spec: 018-auth-security-hardening

> Branch: 018-auth-security-hardening | Date: 2026-07-04 | Version: v1.1.0

## 목차

- [배경 및 목적](#배경-및-목적)
- [사용자 스토리](#사용자-스토리)
- [기능 요구사항](#기능-요구사항)
- [비기능 요구사항](#비기능-요구사항)
- [수용 기준](#수용-기준)
- [요구사항 구조화 매트릭스](#요구사항-구조화-매트릭스)
- [선행 spec 영향 추적 (Predecessor Lineage)](#선행-spec-영향-추적-predecessor-lineage)
- [배포 환경 cross-reference 결과 (PROC-009)](#배포-환경-cross-reference-결과-proc-009)
- [범위 외](#범위-외)
- [미결 사항](#미결-사항)

---

## 배경 및 목적

`context.md §6 알려진 제약 및 기술 부채`에 013~016 스펙(013-flutter-customer-phase2, 014-social-login)의 Security Agent 감사가 Medium/Low 취약점으로 판정하여 "후속 위임(Retrospective)"으로 누적시킨 auth 도메인 보안 부채 4건을 해소한다. 개별 항목은 발견 시점 기준 Critical/High 가 아니어서 각 선행 spec 을 블로킹하지 않았으나, 4건이 누적된 현재는 다음과 같은 실질적 운영 리스크를 구성한다:

1. **전역 rate limit 부재** — `POST /auth/social-login`(카카오·구글·네이버 3종 아웃바운드 검증 트리거, GAP-014-06)·`POST /auth/naver/state`(익명 CSRF state 발급, 016 Informational)·`POST /auth/forgot-password`/`POST /auth/find-email`(IP 기반 user enumeration, GAP-013-09)이 모두 익명·무제한 호출에 노출되어 있다.
2. **소셜 신규가입 트랜잭션 비원자성** — `SocialAuthService.login()` path 3c(`createUser`+`createSocialAccount`)가 `runInTransaction` 없이 순차 실행되어(코드 확인: `apps/backend/src/modules/auth/social-auth.service.ts:131-144`), 두 번째 쓰기 실패 시 `password: null` orphan user 가 이메일 슬롯을 점유할 수 있다(GAP-014-01, SEC-002).
3. **비밀번호 재설정 세션 폐기 비원자성** — `AuthService.resetPassword()`(코드 확인: `apps/backend/src/modules/auth/auth.service.ts:244-281`)가 비밀번호 변경 트랜잭션(`markOtpConsumed`) 완료 후 `revokeAllRefreshTokensByUser`를 별도 best-effort 호출로 실행하여, 서버 비정상 종료 시 세션 미폐기가 가능하다(GAP-013-10, SEC-003).
4. **auth 보안 감사 로그 부재** — OTP 검증 실패·rate limit 위반(429)·find-email PII 접근 이벤트를 추적할 감사 로그가 없다(GAP-013-11, SEC-004). `AuthService`/`AuthController` 전체에 보안 이벤트 전용 `Logger` 호출이 0건임을 코드로 확인했다.

본 spec 은 이 4건(이하 "트랙 1~4")을 하나의 auth 보안 하드닝 릴리즈로 묶어 해소하고, `context.md §6` 의 해당 4개 행을 RESOLVED 로 전이 가능한 상태로 만든다.

## 사용자 스토리

- **US-001**: 보안 담당자로서, 익명 공격자의 무제한 요청으로 인한 서버·외부 API 쿼터 소모 및 계정 탈취 시도를 차단하기 위해 auth 엔드포인트에 rate limit 이 적용되기를 원한다.
- **US-002**: 운영자로서, Fly.io 프록시 배포 환경에서도 rate limit 이 개별 클라이언트를 정확히 식별하여 동작하기를 원한다(프록시 연결 IP 단일 버킷으로 무력화되지 않기를 원한다).
- **US-003**: 신규 소셜 로그인 가입자로서, 가입 처리 중 일시적 오류가 발생해도 계정이 반쪽짜리(orphan) 상태로 남지 않기를 원한다.
- **US-004**: 비밀번호를 재설정한 사용자로서, 재설정이 완료되면 기존 세션(refresh token)이 확실히 폐기되어 탈취된 토큰이 무효화되기를 원한다.
- **US-005**: 보안 담당자로서, 브루트포스·user enumeration 시도를 탐지·추적할 수 있도록 관련 보안 이벤트가 감사 로그에 남기를 원한다.

## 기능 요구사항

- **FR-001**: 시스템은 anonymous·authenticated 요청 모두에 적용되는 전역 기본 rate limit 을 도입해야 한다.
- **FR-002**: 시스템은 고위험 auth 엔드포인트(`POST /auth/social-login`, `POST /auth/naver/state`, `POST /auth/forgot-password`, `POST /auth/find-email`, `POST /auth/reset-password`) 각각에 전역 기본값보다 낮거나 같은 개별 rate limit 상한을 적용해야 한다.
- **FR-003**: rate limit 초과 요청은 `429 Too Many Requests` 로 응답해야 한다.
- **FR-004**: 시스템은 Fly.io 프록시 배포 환경에서 rate limit 판정에 실제 클라이언트 IP(프록시 연결 IP 가 아닌 원 요청자 IP)를 사용해야 한다.
- **FR-005**: 소셜 로그인 신규 가입 경로(`SocialAuthService.login()` path 3c)의 사용자 생성과 소셜 계정 연결은 단일 트랜잭션으로 원자적으로 처리되어야 하며, 어느 한쪽이 실패하면 양쪽 모두 롤백되어야 한다.
- **FR-006**: 비밀번호 재설정 완료 시, 비밀번호 변경과 기존 세션(refresh token) 전체 폐기는 원자적으로 함께 성공하거나 함께 실패해야 한다.
- **FR-007**: 시스템은 OTP 검증 실패 이벤트를 WARN 수준 보안 감사 로그로 기록해야 한다.
- **FR-008**: 시스템은 rate limit 위반(429) 이벤트를 WARN 수준 보안 감사 로그로 기록해야 한다.
- **FR-009**: 시스템은 `find-email` PII 조회 이벤트를 WARN 수준 보안 감사 로그로 기록해야 한다.
- **FR-010**: 보안 감사 로그 기록 실패는 원 요청의 정상 처리 흐름을 차단하거나 응답 상태코드를 변경해서는 안 된다(best-effort).

## 비기능 요구사항

- **NFR-001**: 전역 기본 rate limit 임계값은 IP 당 20회/60초 이내여야 한다.
- **NFR-002**: `POST /auth/social-login` 개별 임계값은 IP 당 10회/60초 이내여야 한다.
- **NFR-003**: `POST /auth/naver/state` 개별 임계값은 IP 당 20회/60초 이내여야 한다.
- **NFR-004**: `POST /auth/forgot-password` 개별 임계값은 IP 당 5회/60초 이내여야 한다(기존 email 단위 60초 재발송 제한과 별도 축으로 동작).
- **NFR-005**: `POST /auth/find-email` 개별 임계값은 IP 당 5회/60초 이내여야 한다.
- **NFR-006**: `POST /auth/reset-password` 개별 임계값은 IP 당 10회/60초 이내여야 한다(기존 `OTP_MAX_ATTEMPTS=5` 시도 횟수 제한과 별도 축으로 동작).
- **NFR-007**: rate limit 구현은 constitution P-003(단일 DB 원칙)을 준수하여 Redis 등 신규 외부 데이터 저장소를 도입하지 않고 인-메모리 스토리지로 처리해야 한다.
- **NFR-008**: rate limit 클라이언트 IP 식별은 Fly.io 배포 환경의 `Fly-Client-IP` 헤더(또는 표준 `X-Forwarded-For` 첫 항목)를 신뢰하도록 구성되어야 한다.
- **NFR-009**: 보안 감사 로그에 포함되는 이메일·전화번호는 평문으로 기록되지 않고 마스킹되어야 한다(기존 `maskEmail` 계열 유틸 재사용 원칙).
- **NFR-010**: 본 spec 의 코드 변경은 기존 backend unit/integration 테스트 스위트의 회귀를 0건으로 유지해야 한다(constitution P-006).

## 수용 기준

- **SC-001** (`FR-001`·`NFR-001`): 전역 기본값만 적용되는 라우트(개별 override 없는 엔드포인트, 예: `POST /auth/login`)에 동일 클라이언트 IP 로 60초 이내 21번째 요청 시 `429` 를 반환한다. `[env:integration]`
- **SC-002** (`FR-002`·`NFR-002`): `POST /auth/social-login` 에 동일 클라이언트 IP 로 60초 이내 11번째 요청 시 `429` 를 반환한다. `[env:integration]`
- **SC-003** (`FR-002`·`NFR-003`): `POST /auth/naver/state` 에 동일 클라이언트 IP 로 60초 이내 21번째 요청 시 `429` 를 반환한다. `[env:integration]`
- **SC-004** (`FR-002`·`NFR-004`): `POST /auth/forgot-password` 에 서로 다른 이메일을 대상으로 하더라도 동일 클라이언트 IP 로 60초 이내 6번째 요청 시 `429` 를 반환한다(기존 per-email 60초 제한과 독립적으로 IP 레벨에서 차단됨을 검증). `[env:integration]`
- **SC-005** (`FR-002`·`NFR-005`): `POST /auth/find-email` 에 동일 클라이언트 IP 로 60초 이내 6번째 요청 시 `429` 를 반환한다. `[env:integration]`
- **SC-006** (`FR-002`·`NFR-006`): `POST /auth/reset-password` 에 동일 클라이언트 IP 로 60초 이내 11번째 요청 시 `429` 를 반환한다. `[env:integration]`
- **SC-007** (`FR-003`): rate limit 초과 응답의 HTTP 상태코드가 정확히 `429` 이며 NestJS 표준 `ThrottlerException` 응답 형식과 일치한다. `[env:unit]`
- **SC-008** (`FR-004`·`NFR-008`): `main.ts` 에 클라이언트 IP 신뢰 설정(trust proxy)이 존재하고, rate limit 트래킹 로직이 `Fly-Client-IP`/`X-Forwarded-For` 헤더 기반 IP 를 우선 사용함을 코드 정적 검증으로 확인한다. `[env:static]`
- **SC-009** (`FR-004`): 동일 프록시 연결에서 서로 다른 `X-Forwarded-For` 클라이언트 IP 헤더 값으로 요청을 보내면 각각 독립적인 rate limit 버킷으로 카운트된다(헤더 mock 기반 단위 테스트). `[env:unit]`
- **SC-010** (`FR-005`): `SocialAuthService.login()` path 3c 테스트에서 `createSocialAccount` 실패를 강제할 때, `createUser` 로 생성 시도된 사용자 행이 커밋되지 않고 트랜잭션 전체가 롤백됨을 검증한다. `[env:unit]`
- **SC-011** (`FR-005`): 기존 P2002 동시성 경합 폴백 로직(신규가입 레이스)이 트랜잭션 래핑 이후에도 회귀 없이 동일하게 동작한다(기존 `social-auth.service.spec.ts` 관련 테스트 PASS 유지). `[env:unit]`
- **SC-012** (`FR-006`): `resetPassword()` 실행 시 `revokeAllRefreshTokensByUser` 호출이 `markOtpConsumed` 와 동일 트랜잭션 컨텍스트 내에서 실행됨을 검증한다(트랜잭션 경계 mock/spy 단언). `[env:unit]`
- **SC-013** (`FR-006`): `revokeAllRefreshTokensByUser` 가 실패하도록 강제하면 비밀번호 변경도 함께 롤백되어, 재설정 이전 비밀번호로 로그인 가능한 상태가 유지된다. `[env:integration]`
- **SC-014** (`FR-007`·`NFR-009`): OTP 값 불일치 시 WARN 수준 로그가 1건 기록되고 로그 메시지에 이메일이 마스킹된 형태로 포함됨을 검증한다. `[env:unit]`
- **SC-015** (`FR-008`): rate limit 초과(429) 발생 시 WARN 수준 로그가 1건 기록되고 대상 엔드포인트·클라이언트 IP 정보가 포함됨을 검증한다. `[env:unit]`
- **SC-016** (`FR-009`·`NFR-009`): `find-email` 호출 시 WARN 수준 로그가 1건 기록되고 조회 전화번호·반환 이메일이 마스킹된 형태로 포함됨을 검증한다. `[env:unit]`
- **SC-017** (`FR-010`): 보안 감사 로그 기록 로직이 예외를 던지도록 mock 하더라도 OTP 검증·find-email·429 처리의 원 응답(상태코드·바디)이 로깅 미적용 시와 동일하게 유지된다. `[env:unit]`
- **SC-018** (`NFR-007`): `apps/backend/package.json` 에 Redis 등 외부 캐시/저장소 의존성이 신규로 추가되지 않았음을 정적 검증한다. `[env:static]`
- **SC-019** (`NFR-009`): 감사 로그로 출력되는 문자열에 원본(비마스킹) 이메일·전화번호 패턴이 포함되지 않음을 정규식 기반으로 검증한다. `[env:unit]`
- **SC-020** (`NFR-010`): 본 spec 변경 이후 backend 전체 unit 테스트 스위트가 회귀 0건으로 PASS 한다. `[env:unit]`

## 요구사항 구조화 매트릭스

| US-ID | FR-ID | NFR-ID | SC-ID | [env:*] | MoSCoW |
|---|---|---|---|---|---|
| US-001 | FR-001 | NFR-001 | SC-001 | integration | Must |
| US-001 | FR-002 | NFR-002 | SC-002 | integration | Must |
| US-001 | FR-002 | NFR-003 | SC-003 | integration | Must |
| US-001 | FR-002 | NFR-004 | SC-004 | integration | Must |
| US-001 | FR-002 | NFR-005 | SC-005 | integration | Must |
| US-001 | FR-002 | NFR-006 | SC-006 | integration | Must |
| US-001 | FR-003 | — | SC-007 | unit | Must |
| US-002 | FR-004 | NFR-008 | SC-008 | static | Must |
| US-002 | FR-004 | — | SC-009 | unit | Must |
| US-001 | — | NFR-007 | SC-018 | static | Should |
| US-003 | FR-005 | — | SC-010 | unit | Must |
| US-003 | FR-005 | — | SC-011 | unit | Must |
| US-004 | FR-006 | — | SC-012 | unit | Must |
| US-004 | FR-006 | — | SC-013 | integration | Must |
| US-005 | FR-007 | NFR-009 | SC-014 | unit | Must |
| US-005 | FR-008 | — | SC-015 | unit | Must |
| US-005 | FR-009 | NFR-009 | SC-016 | unit | Must |
| US-005 | FR-010 | — | SC-017 | unit | Must |
| US-005 | — | NFR-009 | SC-019 | unit | Should |
| US-001~005 | — | NFR-010 | SC-020 | unit | Must |

> 매핑 누락 0건 — 모든 FR-XXX/NFR-XXX 에 SC-XXX 최소 1개 대응, 모든 SC-XXX 는 FR 또는 NFR 에 귀속.

## 선행 spec 영향 추적 (Predecessor Lineage)

| 선행 spec | 식별된 결함 항목 | 결함 인지 시점 | 식별 경로 |
|---|---|---|---|
| 013-flutter-customer-phase2 | GAP-013-09 (SEC-002) — `forgot-password`/`find-email` IP 기반 글로벌 rate limit 부재, user enumeration 표면 | 2026-07-01 | Security Agent 감사 (in-pipeline, Medium — Retrospective 위임) |
| 013-flutter-customer-phase2 | GAP-013-10 (SEC-003) — `resetPassword` 세션 폐기(`revokeAllRefreshTokensByUser`) 비원자적 best-effort 호출 | 2026-07-01 | Security Agent 감사 (in-pipeline, Medium — Retrospective 위임) |
| 013-flutter-customer-phase2 | GAP-013-11 (SEC-004) — OTP 실패·429·find-email 접근 보안 감사 로그 부재 | 2026-07-01 | Security Agent 감사 (in-pipeline, Medium — Retrospective 위임) |
| 014-social-login | GAP-014-01 (SEC-002, 014 자체 번호 체계) — 소셜 신규가입 path 3c `createUser`+`createSocialAccount` 비원자 트랜잭션, orphan user 위험 | 2026-07-02 (v1.3 최종 재감사) | Security Agent 감사 (in-pipeline, Medium — Retrospective 위임, GAP-014-01/03 과 동일 근본원인) |
| 014-social-login | GAP-014-06 (SEC-004, 014 자체 번호 체계) — `social-login`/`naver/state` 익명 아웃바운드 증폭 표면 rate limit 부재 | 2026-07-02 | Security Agent 감사 (in-pipeline, Low — Retrospective 위임) |

## 배포 환경 cross-reference 결과 (PROC-009)

- **점검 대상**: 트랙 1(IP 기반 rate limit)이 컨테이너 NAT·L4 LB·리버스 프록시 영향을 받을 가능성 — **있음**(Fly.io 는 엣지 프록시를 경유하여 backend app 에 요청을 전달).
- **infra.md 확인 결과**: `.claude/docs/infra.md` §2(인프라 토폴로지)·§8(알려진 인프라 제약)에 클라이언트 IP 전달 방식(`Fly-Client-IP`/`X-Forwarded-For`, Express `trust proxy` 필요 여부) 기재 없음을 확인.
- **코드 확인 결과**: `apps/backend/src/main.ts` 에 `app.set('trust proxy', ...)` 호출 없음(전문 확인).
- **사용자 결정**: trust proxy 설정 + Fly-Client-IP/X-Forwarded-For 기반 클라이언트 IP 식별을 본 spec FR-004/NFR-008/SC-008/SC-009 범위에 **포함**하기로 확정.
- **후속 조치**: infra.md §2/§8 의 additive 갱신 필요사항은 본 spec 범위에서 직접 수정하지 않고(Spec Agent 단일 책임 경계 준수), 3단계 이후 Design/Docs Agent 가 `SPEC_ROOT/gaps.md` 에 GAP-018-01(문서-갱신-필요)로 정식 등재하고 Retrospective Agent 가 반영한다.

## 범위 외

- **트랙 B (결제·파일·소셜 실연동·배포 구성 변경) 전체**: 본 spec 은 auth 도메인 보안 하드닝(트랙 A)에 한정한다. 결제/정산 PG 실연동, 파일 R2 실연동, 카카오/구글/네이버 소셜 로그인 자체 로직 변경(015/016 에서 이미 완료·커밋됨), Fly.io 배포 구성(fly.toml, flyctl) 변경은 범위 밖이다.
- **트랙 C (Query DTO 미검증·cursor 인덱스·worker 분리) 전체**: `context.md §6` 의 SEC-017-01(cursor 목록 API `@Query` 파라미터 DTO 미검증, Low), DB 인덱스 최적화, `apps/worker` 프로세스 분리는 본 spec 과 무관한 별도 기술 부채이며 범위 밖이다.
- **Naver 소셜 로그인 재도입 관련 사항**: 015-naver-code-exchange·016-naver-state-redirect-hardening 에서 이미 완료·커밋(`0196b9a`)되었다. 본 spec 은 `POST /auth/naver/state` 에 rate limit 만 추가할 뿐, 해당 엔드포인트의 CSRF/도메인 로직 자체는 변경하지 않는다.
- **`POST /auth/login`·`POST /auth/register` 전용 개별 rate limit 강화**: 전역 기본값(NFR-001)만 적용한다. 이 두 엔드포인트에 특화된 기술 부채가 `context.md §6` 에 없으므로 개별 override 대상에서 제외한다.
- **console/Flutter 클라이언트의 `429` 응답 UX 처리**: 클라이언트 측 재시도 안내·오류 메시지 처리는 범위 밖이며, 필요 시 별도 spec 으로 진행한다.
- **보안 감사 로그의 DB 영속화·SIEM 연동**: `admin_audit_logs` 와 유사한 영속 테이블 도입이나 외부 SIEM 연동은 범위 밖이다. WARN 수준 구조적 로그 스트림(pino, Fly 로그 수집)으로 충분하다고 판단한다(사용자 지시 — task 원문 "WARN 수준 보안 로깅").
- **다중 인스턴스 확장 시 rate limit 상태 공유**: 현재 Fly.io 단일 인스턴스(scale-to-zero) 배포이므로 인-메모리 rate limit 스토리지로 충분하다(NFR-007). 향후 다중 인스턴스로 확장 시 분산 스토리지(예: Fly.io 지원 범위 내 대안) 재검토가 필요하나 이는 별도 spec 대상이다.
- **이상 로그인 탐지(anomaly detection)·자동 IP 차단**: 보안 감사 로그 기록까지가 본 spec 의 범위이며, 로그 기반 자동 대응 체계 구축은 범위 밖이다.

### 사후 운영 검증 피드백 사이클 (PROC-014)

본 spec 파이프라인 종료 후 사용자가 운영(Fly.io) 환경에서 점검할 가능성이 있는 시나리오:

1. **Fly.io 실제 프록시 헤더 동작 확인**: 로컬/CI 는 헤더 mock 기반 단위 테스트(SC-008/009)로만 검증 가능하다. 실제 Fly.io 배포 후 `Fly-Client-IP` 헤더가 문서대로 주입되는지, `trust proxy` 설정이 실제 운영 트래픽에서 개별 클라이언트를 정확히 분리하는지는 운영 배포 이후 확인이 필요하다.
2. **정상 사용자 429 오탐 여부**: 소셜 로그인 재시도가 잦은 모바일 환경, 다수 사용자가 동일 NAT/CGNAT IP 를 공유하는 환경에서 임계값(NFR-001~006)이 실제 사용자 경험에 미치는 영향을 운영 트래픽으로 관찰해야 한다.
3. **소셜 신규가입 트랜잭션 원자화 이후 동시성 부하 시나리오**: 다수 사용자가 동시에 동일 소셜 계정으로 최초 가입을 시도하는 실제 트래픽 패턴에서 P2002 폴백 경로(SC-011)가 예상대로 동작하는지 확인이 필요하다.
4. **보안 감사 로그 볼륨·노이즈 수준**: 운영 트래픽에서 WARN 로그 발생 빈도가 과도하여 실제 침해 시도 신호를 가리지 않는지(로그 노이즈) 점검이 필요하다.

사후 검증 결과 결함 발견 시 처리 절차: 결함 정보를 본 spec.md "배경 및 목적" 절 입력 또는 별도 patch spec 입력으로 사용 → main session 의 "spec 수정" 이벤트 → 1단계 재진입(cycle N+1) 또는 별도 patch spec 진입. 사후 검증 미수행 시에는 운영 배포 후 최소 1주일 내 Fly 로그 스트림 샘플 점검을 권장한다(사용자와 별도 합의 필요 — 본 spec 파이프라인 내에서는 일자 미확정).

## 미결 사항

없음 — Q-WT/Q15/Q17 전 항목 사용자 확정 완료. `[NEEDS CLARIFICATION]` 0건.
