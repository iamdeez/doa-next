---
작성: Design Agent
버전: v1.0 (누적 기록 — 최근 갱신자: Development Agent)
최종 수정: 2026-07-02 20:07
상태: 누적 기록 중
---

# Gaps: 014-social-login

> 파이프라인 전 단계가 누적 기록한다. 형식은 `pipeline-conventions.md §6` 을 따른다.
> 해결된 GAP → 해당 Agent 가 상태를 `RESOLVED by [Agent 공식명]` 으로 갱신.

## 목차

- [GAP-014-01](#gap-014-01)
- [GAP-014-02](#gap-014-02)
- [GAP-014-03](#gap-014-03)
- [GAP-014-04](#gap-014-04)
- [GAP-014-05](#gap-014-05)
- [GAP-014-06](#gap-014-06)
- [GAP-014-07](#gap-014-07)
- [GAP-014-08](#gap-014-08)
- [GAP-014-09](#gap-014-09)
- [GAP-014-10](#gap-014-10)

---

## GAP-014-01

- **유형**: 검증-공백 (tx-aware 원자성 e2e 미검증)
- **출처**: Design Agent
- **컨텍스트**: `SocialAuthService`(FR-006 신규 가입) — createUser + createSocialAccount 원자성
- **상태**: OPEN (사후 운영 검증·Security 검토 위임)
- **내용**: FR-006 소셜 전용 신규 가입 경로는 `createUser`(tx-aware 전환) + `createSocialAccount` 를 `runInTransaction` 으로 원자 처리한다. 그러나 본 spec 은 e2e(SC-019)가 명시적 deferred(옵션 B, 범위 외)이므로, 트랜잭션 롤백·orphan user 방지의 **실경로(실 PrismaService·실 DB)** 검증을 파이프라인 내에서 수행할 수 없다(PROC-013-01 e2e 매핑 한계). 단위 테스트는 `AuthRepository` 전체를 mock 하여 tx/root 분기가 표면화되지 않는다.
- **안전망**: (1) `PrismaService.get tx()` 의 root fallback graceful(register 경로 회귀 없음, smoke_tests 확인). (2) DB `users.email @unique` + `social_accounts @@unique([provider,providerId])` 최종 정합성. (3) 서비스 P2002 catch → 재해석 폴백.
- **후속 처리**: (a) 사후 운영 검증(spec PROC-014 §사후 운영 검증)에서 통합 정합성 점검. (b) **완료 — Security Agent** 가 `security/security-report.md` SEC-002 로 자동연동 계정 정합성·orphan 위험 감사를 완료(코드 grep 으로 `runInTransaction` 미wrapping 재확인, Medium 분류·계정탈취 무관 확인). (c) 필요 시 후속 spec 에서 repository 통합 테스트(testcontainers 등) 도입 검토.

---

## GAP-014-02

- **유형**: D-layer 테스트 불일치 ([B] 카테고리)
- **출처**: Development Agent
- **컨텍스트**: `social-auth.service.spec.ts` (5a Test Agent AUTHORING) — `SocialAuthService` path 3c mock 불일치
- **상태**: RESOLVED by Test Agent (EXECUTION)
- **내용**: 5a 가 작성한 `social_login_flow_test.dart` 에서 `ProviderScopeWidget`(riverpod 내부 타입)을 타입 인자로 사용하여 `non_type_as_type_argument` 오류 발생 (test/features/social_login_flow_test.dart:115). flutter analyze test/ 기준 error 1건. production lib/ 기준 0 errors. 5a 테스트 코드 수정 필요(`ProviderScope` 또는 `ProviderContainer` 직접 접근 패턴으로 교체).
  - **추가 발견 (재개 세션)**: `social_login_static_test.dart` 의 `libPath()`/`backendEnvExamplePath()` 헬퍼가 `Directory.current.path` 를 `test/features/` 기준으로 가정(주석 "test 디렉토리(`test/features/`)를 기준으로")하나, `flutter test` 실행 시 실제 cwd 는 패키지 루트(`mobile/customer_app/`)이므로 상대경로 계산이 틀어져 파일을 찾지 못함. 결과: `flutter test test/features/social_login_static_test.dart` 실행 시 SC-011·SC-012·SC-013·SC-018 4건 FAIL("~ 파일이 존재해야 한다")·SC-017(no-op 마커) 만 PASS. production 코드(`login_screen.dart` 의 `_SocialRow` GestureDetector 3종·`.env.example` 크레덴셜 4종)는 grep 으로 직접 확인 시 정상 존재(Development Agent 자체 검증, 본 세션). 즉 프로덕션 결함이 아닌 **테스트 경로 계산 버그**(D-layer, 5a 소유) — `Directory.current` 대신 `Platform.script` 기반 경로 계산 또는 package root 기준 상수 경로로 수정 필요.
- **5b EXECUTION 정정 내역** (Test Agent):
  1. `social_login_flow_test.dart:115` — `ProviderScopeWidget` 내부 타입 참조를 `flutter_riverpod` 공개 테스트 헬퍼 `tester.container(of: find.byType(LoginScreen))` (export 된 `RiverpodWidgetTesterX` extension) 로 교체.
  2. `social_login_static_test.dart` `libPath()`/`backendEnvExamplePath()` — cwd 기준을 패키지 루트(`mobile/customer_app/`)로 정정.
  3. **5b 추가 발견 (연쇄 결함, 위 2건에 가려져 있었음)**: (a) 세 플로우 테스트가 존재하지 않는 `Key('social-btn-kakao')` 로 카카오 버튼을 찾는 조건부 구조(`if (kakaoButton.evaluate().isNotEmpty) {...} else { markTestSkipped(...) }`)였음 — production `_SocialRow` 는 해당 Key 를 가진 적이 없어 assert 분기가 **한 번도 실행되지 않고 항상 skip** 되는 상태(TDD Red 잔존 anti-pattern, "실패 테스트 skip 처리로 통과" 와 동일한 결과). 이모지 텍스트('💬') ancestor 기반 `find.ancestor(of: find.text('💬'), matching: find.byType(GestureDetector))` 로 교체 + skip 분기 제거(하드 assert 전환) — 정정 후 SC-014/015/016 assert 최초로 실제 실행 확인. (b) SC-014 하드 assert 전환 후 신규 노출: `AuthController.socialLogin` 성공 경로의 `TokenStore.save`(실 `FlutterSecureStorage`)가 위젯 테스트 환경(host 플랫폼 채널 미등록)에서 응답 없이 무한 대기 → 로딩 스피너 애니메이션 ticker 로 `pumpAndSettle timed out`. `tokenStoreProvider` 를 in-memory `_FakeTokenStore` 로 override 하여 해소.
- **검증**: `flutter analyze lib/` 0 issues, `flutter analyze test/features/social_login_flow_test.dart` 0 issues, `flutter test test/features/social_login_static_test.dart test/features/social_login_flow_test.dart` 8/8 PASS.
- **후속 처리**: 없음 (해소 완료). (b) 패턴(실 secure storage/플랫폼 채널 의존 위젯 테스트는 provider override 필요)은 향후 유사 D-layer 테스트 작성 시 참고할 일반 패턴으로 기록.

---

## GAP-014-03

- **유형**: 설계-구현 불일치 (tasks.md vs 5a 테스트 계약)
- **출처**: Development Agent
- **컨텍스트**: `SocialAuthService` path 3c — `createUserWithSocialAccount` vs `createUser`+`createSocialAccount` 호출 방식
- **상태**: RESOLVED by Development Agent
- **내용**: tasks.md T-B4 는 "runInTransaction(createUser+createSocialAccount)" 명시. 5a 테스트 mock 이 `createUserWithSocialAccount` 없이 `createUser`+`createSocialAccount` 개별 mock 으로 구성되어 초기 구현(`createUserWithSocialAccount` 단일 호출) 시 "not a function" 3건 실패 발생. Development Agent 가 `SocialAuthService` path 3c 를 `createUser`+`createSocialAccount` 순차 호출로 변경하고 `AuthRepository.createUserWithSocialAccount` dead code 제거. 5a 테스트 전체 PASS 확인.
- **부작용**: path 3c non-atomic. P2002 catch 폴백이 안전망이나 `createUser` 성공 후 `createSocialAccount` 실패 시 orphan user 가능. GAP-014-01 §후속 처리 (c)와 연계.

---

## GAP-014-04

- **유형**: 구현 결함 ([A] 카테고리 — 런타임 초기화 실패)
- **출처**: Development Agent (04-development.md §G 런타임 초기화 1회 검증 중 발견)
- **컨텍스트**: `GoogleProvider` 생성자 — `ConfigService.getOrThrow('GOOGLE_CLIENT_ID')`
- **상태**: RESOLVED by Development Agent
- **내용**: `GoogleProvider` 생성자에서 `getOrThrow` 로 `GOOGLE_CLIENT_ID` 를 즉시 조회하여, 로컬 `.env`(및 CI 등 실 크레덴셜 미설정 환경)에 해당 값이 없으면 **AuthModule 전체 DI 인스턴스화가 실패하여 앱 전체가 기동 불가**한 상태였다. `test/health.e2e-spec.ts` (AppModule 전체 부팅 e2e) 실행으로 최초 발견 — 단위 테스트(Jest, 전량 mock)로는 표면화되지 않았음. spec.md NFR-004("크레덴셜 실 값 발급은 운영 셋업 단계에서 수행하며, 본 spec 검증 범위에서는 stub/mock을 사용한다")의 취지상 크레덴셜 미설정 상태에서도 앱은 정상 기동해야 한다.
- **처리**: `configService.getOrThrow` 호출을 생성자에서 `verify()` 메서드 내부(호출 시점)로 이동. Kakao/NaverProvider 는 원래 크레덴셜 조회가 없어 동일 문제 없음. 수정 후 `health.e2e-spec.ts`(app.init() 포함) PASS, 기존 auth 유닛 테스트(40건) 회귀 없음 확인.
- **비고**: `KAKAO_REST_API_KEY`·`NAVER_CLIENT_ID`·`NAVER_CLIENT_SECRET` 은 `.env.example`에 선언되어 있으나(SC-018 충족, static 존재 검증만 요구) 현재 채택된 검증 방식(client bearer token 단순 전달 — `kapi.kakao.com/v2/user/me`, `openapi.naver.com/v1/nid/me`)은 이 값들을 코드에서 실제로 읽지 않는다. NFR-004/SC-018 은 존재만 요구하므로 스펙 위반은 아니나, PATCH-002 자가점검 관점의 참고 사항으로 기록. 향후 카카오·네이버도 앱 단위 검증(REST_API_KEY 대조 등)을 강화할 경우 재검토.

---

## GAP-014-05

- **유형**: 문서-갱신-필요
- **출처**: Docs Agent
- **컨텍스트**: `.claude/docs/context.md` §2(핵심 모듈 목록)·§4(데이터 모델)
- **상태**: 미해결
- **내용**: 본 spec으로 신규 추가된 다음 사실이 context.md 에 반영되어 있지 않다 (PATCH-A10 판정 기준 — 새 모듈·클래스 추가 / §2 기존 설명 부정확화).
  1. `SocialAuthService`(`apps/backend/src/modules/auth/social-auth.service.ts`) — 계정 해석 3단계 우선순위(providerId 매칭 → email 매칭 자동연동 → 신규가입) 오케스트레이션. §2 `auth` 모듈 행(현재 로그인/JWT/Refresh/OTP/이메일찾기만 기술, line 75)에 소셜 로그인 위임 필요.
  2. `SocialProviderPort`(`apps/backend/src/modules/auth/social/social-provider.port.ts`) 추상 인터페이스 + `KakaoProvider`·`GoogleProvider`·`NaverProvider`·`StubSocialProvider` 구현체(`social/` 디렉토리, 4개 파일) — §2 `shared/auth` 또는 신규 서브섹션에 미등재.
  3. `users.social_accounts` 테이블(신규, `users` 스키마) — §4 데이터 모델 스키마 분리 구조(line 176~206)에 미등재. 코드 검증: `apps/backend/prisma/schema.prisma` (본 diff 반영분) `model SocialAccount` — `@@unique([provider, providerId])`·`@@index([userId])`·`@@schema("users")` 확인됨.
  4. `users.users.password: String → String?` 전환(ADR-005) — §4 스키마 분리 구조 또는 도메인 모델 절에 nullable 반영 필요. 코드 검증: `schema.prisma` `password String?` 확인됨(git diff 58ee0d1 상 `-  password      String` / `+  password       String?`).
- **영향 범위**: context.md §2(핵심 모듈 목록)·§4(데이터 모델). 후속 spec 설계 시 auth 모듈 구조·소셜 계정 스키마를 context.md 없이 재분석해야 하는 중복 작업 발생 위험.
- **임시 결정**: `[context.md 갱신 필요]`
- **후속 처리**: Retrospective Agent 가 §2 `auth` 모듈 행에 소셜 로그인 위임 문구 추가 + §4 에 `social_accounts` 테이블·`User.password` nullable 반영하는 패치 도출.

---

## GAP-014-06

- **유형**: 문서-갱신-필요
- **출처**: Docs Agent
- **컨텍스트**: `.claude/docs/infra.md` §7(배포 전 확인 체크리스트)·§8(알려진 인프라 제약)
- **상태**: 미해결
- **내용**: 본 spec으로 신규 추가된 다음 사실이 infra.md 에 반영되어 있지 않다 (PATCH-A09 판정 기준 — 새 외부 시스템 연동 추가).
  1. **신규 아웃바운드 외부 시스템 연동 3종**: `kapi.kakao.com`(카카오)·`oauth2.googleapis.com`(구글)·`openapi.naver.com`(네이버) — 백엔드가 소셜 제공자 토큰 검증을 위해 아웃바운드 HTTP 호출을 수행(plan.md "배포 환경 영향" 절 확인: "Fly.io 아웃바운드 트래픽 제한 없음"으로 판단했으나 infra.md §5 연결 실패 재시도 동작·§8 알려진 제약에 이 3종 제공자가 등재되어 있지 않다).
  2. **신규 크레덴셜 env 4종**: `KAKAO_REST_API_KEY`·`GOOGLE_CLIENT_ID`·`NAVER_CLIENT_ID`·`NAVER_CLIENT_SECRET`(ADR-007, `.env.example` 존재 확인 — 코드 검증: `apps/backend/.env.example` 본 diff 반영분 grep 확인됨) — infra.md §7 배포 전 확인 체크리스트에 SMTP·ADMIN_USER_IDS 항목처럼 등재 필요.
  3. **자동 연동(FR-005) 운영 주의사항**: 제공자 이메일 신뢰 전제(ASM-001/NFR-002)가 계정 탈취 벡터라는 사실 — Security Agent(활성, 본 spec 파이프라인 계속 진행 중) 최종 감사 결과에 따라 infra.md §8 알려진 인프라 제약에 등재할지 여부가 확정될 수 있으므로, Retrospective 시점에 Security Agent 산출물(security-report.md)과 함께 재확인 필요.
- **영향 범위**: infra.md §7(배포 전 확인 체크리스트)·§8(알려진 인프라 제약). 실 크레덴셜 발급·운영 배포 시 체크리스트 누락으로 인한 배포 공백 위험.
- **임시 결정**: `[infra.md 갱신 필요]`
- **후속 처리**: Retrospective Agent 가 §7 에 OAuth 크레덴셜 4종 체크리스트 항목 추가 + §8 에 소셜 제공자 아웃바운드 의존성 행 추가. **Security Agent 산출물(security-report.md) 확정됨 — GAP-014-07(SEC-001) 참조**. §8 자동 연동 이메일 신뢰 모델 관련 운영 주의사항 반영 시 GAP-014-07 문구를 사용할 것.

---

## GAP-014-07

- **유형**: 보안 취약점 (High)
- **출처**: Security Agent
- **컨텍스트**: `apps/backend/src/modules/auth/social/kakao.provider.ts`, `naver.provider.ts`, `social-auth.service.ts`(FR-005 자동연동 path 3b)
- **상태**: PARTIALLY RESOLVED by Development Agent (Kakao) — Naver 잔여 위험은 GAP-014-08 로 분리 추적
- **내용**: `GoogleProvider` 는 `tokeninfo` 응답의 `aud !== GOOGLE_CLIENT_ID` 를 검증하여 DOA 앱이 발급하지 않은 id_token 을 거부하지만(`google.provider.ts:42-44`), `KakaoProvider`/`NaverProvider` 는 이에 대응하는 app/client 바인딩 검증이 전혀 없다. `.env.example` 의 `KAKAO_REST_API_KEY`·`NAVER_CLIENT_ID`·`NAVER_CLIENT_SECRET` 는 코드에서 실제로 읽어 대조되지 않는다. 따라서 카카오/네이버에 한해 **타 애플리케이션이 발급한 access token 을 DOA 백엔드에 그대로 재전송해도 구분 없이 신뢰**되며, FR-005 자동 연동(email 매칭) 경로와 결합하면 계정 탈취로 이어질 수 있다. 상세 공격 시나리오·수정 방향은 `docs/specs/v1.1.0/014-social-login/security/security-report.md` SEC-001 참조.
- **영향 범위**: `SocialAuthService.login()` path 3b(자동 연동)·path 3a(재로그인, providerId 매칭이 app-scoping 에 따라 완화될 수 있으나 미확정). NFR-002/ASM-001 신뢰 전제의 실제 구현 격차.
- **처리 (Kakao — 완료)**: `KakaoProvider.verify()` 에 `GET https://kapi.kakao.com/v1/user/access_token_info` 호출을 프로필 조회(`/v2/user/me`) 앞단에 추가하고, 응답의 `app_id` 를 신설 env `KAKAO_APP_ID`(`.env.example` 갱신)와 대조하여 불일치 시 `UnauthorizedException` 을 던지도록 수정했다(google `aud` 검증과 동일 목적). `KAKAO_APP_ID` 조회는 `GoogleProvider`(GAP-014-04)와 동일하게 `verify()` 호출 시점으로 지연하여, 미설정 상태에서도 앱 전체 기동에는 영향이 없음을 `health.e2e-spec.ts` 로 확인했다(로컬 `.env` 에 `KAKAO_APP_ID` 미설정 상태에서 부팅 성공). 회귀 테스트: `apps/backend/src/modules/auth/social/kakao.provider.spec.ts`(신규, SC-XXX 비매핑 보안 회귀 테스트) — 정상 app_id 통과·불일치 app_id 거부·access_token_info 실패 거부 3케이스, 백엔드 전체 유닛 303/303 PASS(회귀 0), `nest build` 0 error 확인.
- **처리 (Naver — best-effort, 미해결)**: 네이버 오픈API는 카카오 access_token_info(app_id)·구글 tokeninfo(aud) 에 대응하는 "토큰 발급 앱 식별" 공개 엔드포인트를 제공하지 않아, 동일한 방식의 app 바인딩 검증을 코드로 구현할 수 없었다. `naver.provider.ts` 클래스 docstring 에 잔여 위험과 완화 대안(authorization code 교환 방식 전환 또는 FR-005 소유권 확인 단계 추가 — 둘 다 spec 변경 필요)을 명시하고, 잔여 위험을 **GAP-014-08** 로 분리 기록했다.
- **후속 처리**: main session 이 사용자와 함께 naver 잔여 위험(GAP-014-08)에 대해 (b) 대안 검증 도입 또는 위험 수용, (c) FR-005 경로에 대한 스펙 변경(NFR-002 재검토) 중 방향을 결정한다. 결정 후 spec.md/plan.md 정합성 갱신 + context.md §6 additive 등재(GAP-014-06 §8 문구와 연계) 필요. Kakao 수정 완료로 SEC-001 의 심각도는 "카카오 자동연동 탈취 경로 차단, 네이버 경로 잔존"으로 재평가 필요(Security Agent 재검토 대상).
- **5b 재검증 (Test Agent EXECUTION)**: Kakao 수정 회귀 테스트(`kakao.provider.spec.ts` 3건) PASS 확인, 백엔드 전체 303/303 PASS(회귀 0)·build 0 error·health e2e 3/3 PASS(KAKAO_APP_ID 미설정 상태 기동 정상)·SC-001~018 매핑 테스트 회귀 0·STALE_SC 재검출 0 확인. 상세는 `test/coverage.md` §SEC-001 재검증, `test/test-report.md` §SEC-001 재검증(본 회차) 참조.
- **Security Agent 재감사 (본 회차)**: Kakao 수정을 코드 레벨(`kakao.provider.ts`)로 독립 재검증 — (1) app_id 대조가 프로필 조회 이전에 실행됨(검증 순서 정상), (2) `KAKAO_APP_ID` 미설정 시 `getOrThrow` 가 던지는 예외가 어디서도 catch 되지 않고 Nest 기본 500 응답으로 종결됨(fail-closed, fail-open 아님), (3) `SocialLoginDto`/`SocialProviderResolver` 화이트리스트로 provider 우회 불가 확인. **결론: Kakao 경로는 SEC-001 원 취약점이 해소되었다.** 상세는 `security/security-report.md` v1.1 §SEC-001 재감사 (v1.1) — (1) Kakao 참조. 본 GAP 의 상태값(PARTIALLY RESOLVED)은 이 재검증과 일치하므로 변경하지 않는다.

---

## GAP-014-08

- **유형**: 보안 취약점 (잔여 위험, best-effort 미해결)
- **출처**: Development Agent (GAP-014-07 SEC-001 복귀 처리 중 분리)
- **컨텍스트**: `apps/backend/src/modules/auth/social/naver.provider.ts`
- **상태**: OPEN — main session/사용자 결정 대기
- **내용**: 네이버 오픈API는 카카오의 `access_token_info`(`app_id`)·구글의 `tokeninfo`(`aud`) 에 대응하는, access token 이 어느 애플리케이션에 발급되었는지 식별할 수 있는 공개 엔드포인트를 제공하지 않는다(조사 결과 — 네이버 로그인 오픈API 문서상 `/v1/nid/me` 외 별도 토큰 소유 앱 식별 엔드포인트 부재). 따라서 `NaverProvider.verify()` 는 타 애플리케이션이 발급한 access token 을 구분할 방법이 없고, FR-005 자동 연동(email 매칭) 경로와 결합 시 GAP-014-07/SEC-001 과 동일한 계정 탈취 시나리오가 네이버에 한해 잔존한다.
- **완화 조치 (적용됨)**: `naver.provider.ts` `NaverProvider` 클래스 docstring 에 잔여 위험을 명시하여 향후 코드 리뷰·감사에서 재발견되도록 했다. 코드 로직 변경은 없음(공개 API 로 검증 불가).
- **완화 대안 (spec 변경 필요 — 미채택)**:
  1. `NAVER_CLIENT_SECRET` 을 사용하는 authorization code 교환 방식으로 검증 흐름 전환 (ADR-001 재검토).
  2. FR-005 자동연동 경로에 추가 소유권 확인 단계 도입 (NFR-002 "추가 이메일 소유권 검증 단계를 두지 않는다" 명시적 변경 필요).
- **후속 처리**: main session 이 사용자와 함께 위험 수용(risk acceptance) 또는 대안 1/2 채택 여부를 결정한다. 위험 수용 시 context.md §6 알려진 제약에 등재(GAP-014-06 §8 문구와 연계). 대안 채택 시 별도 spec 으로 분리(ADR-001 또는 NFR-002 변경은 spec.md/plan.md 정합성 갱신 선행 필요).
- **5b 재검증 (Test Agent EXECUTION)**: 카테고리 (2) 단위테스트 불가로 `test/coverage-gap.md` 에 등재 완료(공개 API 제약으로 코드 수정 자체 불가 — 단위 테스트 대상 아님). SC-XXX 매핑 없음.
- **Security Agent 재감사 (본 회차) — 심각도 재판정: High 유지**: `naver.provider.ts` 로직이 이번 수정에서 변경되지 않았음(docstring 추가만)을 diff 로 재확인했다. 심각도를 Medium(문서화된 기술적 제약)으로 하향할지 검토한 결과, (1) 공격 체인이 수정 전 Kakao 와 완전히 동일(계정 탈취까지 도달), (2) 문서화는 실제 악용 가능성·영향을 낮추는 기술적 완화가 아님(발견 가능성만 개선), (3) authorization code + client_secret 교환 방식이라는 실행 가능한 완화 대안이 이미 식별되어 있음에도 미채택(spec 변경 미착수 상태일 뿐 "불가능"이 아님), (4) Naver 는 저사용 provider 가 아니어서 공격 전제 실현 가능성이 낮다고 볼 근거 없음, (5) FR-005 자동연동에 보상 통제(추가 확인 단계, rate limit, 이상탐지) 전혀 없음 — 5개 근거로 **Medium 하향 불가**, High 유지로 판정했다. 상세 근거는 `security/security-report.md` v1.1 §SEC-001 재감사 (v1.1) — (2) Naver 심각도 판정 참조. 권고안 3종(FR-005 naver 예외/naver 제외/위험수용)을 동 절에 제시했다. 본 GAP 의 상태값(OPEN — main session/사용자 결정 대기)은 이 재판정과 일치하므로 변경하지 않는다.
- **처리 (v1.2, 본 회차) — 사용자 결정: 권고안 (a) FR-005 naver 예외 채택**: 사용자가 security-report.md 권고 3종 중 (a) "FR-005 자동연동을 Naver 에 한해 비활성화"를 채택했다. `social-auth.service.ts` 에 `AUTO_LINK_PROVIDERS`(kakao·google) 화이트리스트를 도입하여 provider 가 이 목록에 없으면(naver) email 매칭 자동연동(path 3b)을 수행하지 않고 `ConflictException`(409)으로 거부하도록 수정했다. Naver 는 path 3a(providerId 매칭 재로그인) 또는 email 이 겹치지 않는 경우의 path 3c(신규 독립 계정 생성)만 허용된다. path 3c 의 P2002 catch 내 email 기반 race fallback 도 동일 화이트리스트로 게이팅하여, 동시성 경합 상황에서도 naver 는 자동연동되지 않도록 정책을 일관되게 적용했다. Kakao/Google 은 `AUTO_LINK_PROVIDERS` 에 포함되어 기존 자동연동 동작이 그대로 유지된다(회귀 테스트로 확인). `naver.provider.ts` docstring 을 "자동연동 비활성으로 완화" 로 갱신했다(완전 해소 아님 — 근본 원인인 앱 바인딩 검증 수단 부재 자체는 미해소, ADR-001 재검토를 완전 해소 방안으로 계속 추적).
  - **회귀 테스트**: `social-auth.service.autolink-policy.spec.ts`(신규, SC-XXX 비매핑 보안 회귀 테스트) — naver+기존이메일→Conflict(자동연동·신규생성 모두 미호출), naver+신규이메일→독립계정 정상 생성(path 3c 회귀 없음), kakao/google+기존이메일→자동연동 유지(회귀 없음) 4케이스. 백엔드 전체 유닛 307/307 PASS(303→307, 신규 4건), `nest build`/`tsc --noEmit` 0 error.
  - **spec.md 정합성 미반영 (신규 발견)**: FR-005("소셜 제공자로부터 획득한 이메일이 기존 사용자 계정의 이메일과 동일한 경우, 해당 소셜 계정을 기존 계정에 연동...") 와 NFR-002("자동 연동(FR-005) 시... 추가 이메일 소유권 검증 단계를 두지 않는다")는 provider 무관하게 서술되어 있어, 본 수정이 도입한 "Naver 는 자동연동 자체를 수행하지 않는다"는 provider 단위 예외를 spec.md 문구가 아직 반영하지 않는다(security-report.md 권고 (a) 자체도 "provider 단위 예외로 spec.md 명시 필요"라고 명시함). 기존 SC-002/SC-009 테스트는 provider 를 각각 kakao/naver(3a 매칭)로 고정하여 검증하므로 이번 변경으로 회귀하지 않으나(코드 대조로 확인), spec.md 문구와 구현 간 정합성 갱신은 별도 결정(Spec Agent 또는 main session)이 필요하여 GAP-014-09 로 신규 분리한다.
  - **후속 처리**: 없음(코드·회귀 테스트 완료). GAP-014-08 은 "완화 조치 적용 완료(자동연동 비활성)" 상태로 갱신하되 상태값 자체(OPEN)는 근본 원인 미해소이므로 유지 — 완전 해소는 GAP-014-09 의 spec.md 갱신 및/또는 ADR-001 재검토 완료 시점.
- **5b 재검증 (Test Agent EXECUTION, 본 회차)**: `social-auth.service.ts` production 코드를 직접 Read 하여 `AUTO_LINK_PROVIDERS` 화이트리스트가 path 3b·path 3c race fallback 양쪽에서 일관되게 게이팅됨을 확인. 신규 회귀 테스트 `social-auth.service.autolink-policy.spec.ts` 4/4 PASS(naver+기존이메일→Conflict, createSocialAccount/createUser/issueTokensForUser 모두 미호출 단언 확인 — mock 이 production 하드코딩 경로를 우회하지 않음, PATCH-03 자가점검). 5a 소유 `social-auth.service.spec.ts` 의 SC-002(kakao 고정)·SC-009(path 3a 한정) 는 provider 무관 자동연동을 단언하지 않아 naver 정책 변경과 충돌 없음(코드 대조 확인, [B] 정정 불필요). 백엔드 전체 30 suites/307 tests PASS(회귀 0)·health e2e 3/3·tsc/build 0 error·STALE_SC 재검출 0. 상세는 `test/coverage.md` §SEC-001 재검증 (Naver 자동연동 비활성), `test/test-report.md` §Naver 자동연동 비활성 재검증 (본 회차) 참조. 본 GAP 의 상태값(OPEN — 근본원인 미해소)은 변경하지 않음.
- **처리 (v1.3, 본 회차) — 사용자 최종 결정: Naver 이번 릴리즈 완전 제외 — RESOLVED by Development Agent**: GAP-014-10(path 3a 재로그인 잔존 위험)이 신규 확정되어 자동연동 비활성(v1.2)만으로는 SEC-001 이 완전히 해소되지 않음이 드러남에 따라, 사용자가 Security Agent 권고 (b) "Naver 소셜 로그인을 이번 릴리즈에서 완전 제외"를 최종 채택했다. `SocialProviderResolver`(kakao·google 2개 provider 만 매핑, naver 요청은 `UnauthorizedException`)·`SocialLoginDto`(`SUPPORTED_PROVIDERS`에서 naver 제거, naver 요청은 `@IsIn` 검증 실패로 400 거부 — 컨트롤러 진입 이전 최초 차단)·`AuthModule`(`NaverProvider` providers 배열에서 제거, DI 미와이어)·Flutter `login_screen.dart`(`_SocialRow`에서 네이버 버튼 제거)·`social_auth_service.dart`(`SocialAuthService` 추상 인터페이스에서 `signInWithNaver` 제거)를 수정하여 naver 가 API 경계(DTO 검증)에서부터 완전히 거부되도록 했다. `naver.provider.ts` 파일 자체는 삭제하지 않고 module/resolver 어디에도 와이어링하지 않는 방식으로 보존했다(향후 authorization code + client_secret 교환 방식 ADR-001 재검토 시 재도입 전제 — docstring 갱신). 이로써 path 3a/3b/3c 모두 naver 경로 자체가 원천 차단되어, GAP-014-08 근본 원인(앱 바인딩 검증 수단 부재) 자체는 여전히 사실이나 naver 가 활성 provider 가 아니므로 더 이상 리스크로 작용하지 않는다.
  - **검증**: 백엔드 `tsc --noEmit` 0 error·`nest build` 0 error·유닛 30 suites/306 tests PASS(307→306, 5a 가 SC-009 naver 테스트 제거)·`health.e2e-spec.ts` 3/3 PASS(NaverProvider 미와이어 상태에서도 AppModule DI 정상 기동 확인 — GAP-014-04 런타임 초기화 패턴과 동일하게 재확인). `grep -rniI naver apps/backend/src mobile/customer_app/lib` 잔여 항목은 모두 배경 설명 주석과 `naver.provider.ts` 자체 내부 코드(미와이어)뿐이며 실행 경로상 도달 가능한 참조 0건. Flutter `flutter analyze lib/` 0 issues·`flutter test test/features/social_login_static_test.dart test/features/social_login_flow_test.dart` 7/7 PASS(8→7, 5a 가 SC-013 naver 버튼 테스트 제거).
  - **후속 처리**: 없음(코드 완전 해소). 상태를 `RESOLVED by Development Agent` 로 갱신한다(GAP-014-10 과 함께 해소 — 아래 참조). 향후 naver 재도입 시(별도 spec) 이 GAP 을 참조하여 authorization code + client_secret 교환 방식(ADR-001)을 전제 조건으로 채택해야 한다.
- **상태 갱신**: ~~OPEN~~ → **RESOLVED by Development Agent** (v1.3, Naver 이번 릴리즈 완전 제외로 잔여 위험 자체가 소거됨)
- **5b 재검증 (Test Agent EXECUTION, 본 회차 — Naver 완전 제외 후)**: Development Agent 가 보고한 검증 수치를 독립적으로 재실행하여 일치 확인 — 백엔드 30 suites/306 tests PASS, `tsc --noEmit`/`nest build` 0 error, `health.e2e-spec.ts` 3/3 PASS, `flutter test` 7/7 PASS, `flutter analyze lib/` 0 issues, `grep -rniI naver apps/backend/src mobile/customer_app/lib` 잔여 33건 전부 주석·미와이어 코드·방어적 회귀 테스트뿐(실행 경로 도달 참조 0건). RESOLVED 판정에 동의. 상세는 `test/coverage.md` §SEC-001 최종 재검증(Naver 완전 제외), `test/test-report.md` §Naver 완전 제외 최종 재검증(본 회차) 참조.

---

## GAP-014-09

- **유형**: 문서-갱신-필요 (설계-구현 정합성)
- **출처**: Development Agent (GAP-014-08 Naver 자동연동 비활성화 구현 중 발견)
- **컨텍스트**: `spec.md` FR-005, NFR-002
- **상태**: 미해결
- **내용**: `apps/backend/src/modules/auth/social-auth.service.ts` 는 이번 수정으로 `AUTO_LINK_PROVIDERS`(kakao, google) 화이트리스트에 없는 provider(naver)의 email 매칭 자동연동(FR-005 path 3b)을 차단하도록 변경되었다. 그러나 `spec.md` 의 FR-005·NFR-002 문구는 provider 를 구분하지 않고 서술되어 있어("소셜 제공자로부터 획득한 이메일이... 동일한 경우" — provider 특정 없음), 구현이 spec 문구보다 더 좁은 조건(kakao·google 한정)으로 동작하는 정합성 간극이 발생했다.
- **영향 범위**: `spec.md` FR-005·NFR-002·ASM-001(제공자 이메일 신뢰 전제). SC-002(FR-005) 테스트는 이미 kakao 한정으로 작성되어 있어 회귀는 없으나, 문서상 FR-005 가 "모든 제공자에 적용"으로 읽히는 모호함이 남는다.
- **임시 결정**: `[spec.md FR-005/NFR-002 provider 단위 예외 명시 필요]` — security-report.md v1.1 권고 (a) 채택에 따른 필연적 후속.
- **후속 처리**: main session/Spec Agent 가 FR-005 에 "단, Naver 는 제외한다(SEC-001/GAP-014-08 근거)" 형태의 예외 문구를, NFR-002 에는 provider 스코프 한정 문구를 추가하는 spec.md 갱신을 결정한다. 갱신 전까지는 코드(구현) 가 우선하며 spec.md 는 SoT 로서 신뢰할 수 없는 상태임을 인지해야 한다.
- **5b 인지 (Test Agent EXECUTION, 본 회차)**: 본 정합성 간극을 인지·재확인했다(spec.md 는 타 단계 산출물이므로 직접 수정하지 않음 — 단일 책임 준수). SC-002(kakao 고정)·SC-009(naver path 3a 한정) 기존 테스트는 이미 provider 를 고정하여 검증하므로 spec 문구와 무관하게 회귀가 없음을 코드 대조로 재확인했다. 상태값(미해결)은 변경하지 않음 — main session/Spec Agent 결정 대기.
- **범위 확대 (v1.3, Development Agent, 본 회차) — 미해결 유지**: 사용자가 Naver 를 이번 릴리즈에서 완전 제외하기로 결정하면서, 본 GAP 이 다루던 간극("FR-005 자동연동만 provider 단위 예외")보다 **더 넓은 정합성 간극**이 발생했다. `spec.md` FR-001("카카오·구글·네이버 중 하나")·NFR-004("각 OAuth 제공자(카카오·구글·네이버)")·SC-009("`provider: 'naver'` 식별자로... JWT가 반환된다")·SC-013("네이버 소셜 버튼")·SC-018("카카오·구글·네이버 각 제공자의... 크레덴셜")·범위 외 절의 "실 OAuth 제공자 앱 등록(카카오·구글·네이버)" 등 다수 문구가 naver 를 지원 대상으로 명시하고 있으나, 구현은 이제 naver 를 API 경계(DTO `@IsIn`)에서부터 완전히 거부한다(SocialProviderResolver·SocialLoginDto·Flutter 버튼 모두 제거, GAP-014-08/GAP-014-10 처리 참조). 5a Test Agent 가 이미 SC-009(naver 전용 unit)·SC-013(naver 버튼 static)을 "범위 외" 주석과 함께 제거했으나, 이는 테스트 산출물의 임시 정정일 뿐 spec.md 자체는 갱신되지 않았다. `.env.example`의 `NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET` 은 이번 처리에서 제거 대상이 아니었으므로 그대로 남아 있어(SC-018 코드 검증 자체는 변경 없이 통과), spec 문구·env 파일·활성 코드 3자 간 정합성이 더 복잡해졌다.
- **임시 결정 (갱신)**: `[spec.md FR-001/NFR-004/SC-009/SC-013/SC-018/범위 외 절 — Naver 를 "이번 릴리즈 제외(SEC-001/GAP-014-08/GAP-014-10)"로 명시 필요]` — 기존 "FR-005 provider 단위 예외" 수준을 넘어 **provider 지원 목록 자체의 변경**으로 재정의되어야 한다.
- **후속 처리 (갱신)**: main session/Spec Agent 가 spec.md 전면 검토를 통해 (1) FR-001/NFR-004 의 "카카오·구글·네이버" → "카카오·구글(Naver 는 SEC-001/GAP-014-08/GAP-014-10 근거로 이번 릴리즈 제외)" 갱신, (2) SC-009/SC-013 을 5a 가 이미 제거한 상태와 일치하도록 spec.md 의 수용 기준 목록에서 제거 또는 "제외(범위 외)"로 이관, (3) SC-018 크레덴셜 항목에서 NAVER_* 2종의 존치 여부 결정(코드는 `.env.example` 값을 그대로 두었으므로 SC-018 자체는 현재 상태로도 PASS — 결정 필요성은 문서 정합성 차원), (4) 범위 외 절에 naver 완전 제외 사실 추가를 결정한다. 갱신 전까지는 코드(구현) 가 우선하며 spec.md 는 SoT 로서 신뢰할 수 없는 상태임을 인지해야 한다. 상태값은 **미해결 유지**(범위가 넓어졌으므로 이번 회차에서 자동 해소되지 않음).
- **5b 재인지 (Test Agent EXECUTION, 본 회차 — Naver 완전 제외 후 재검증)**: Development Agent 의 "범위 확대" 기록과 spec.md 직접 Read 대조 결과가 일치함을 재확인했다(FR-001/NFR-004/SC-009/SC-013/SC-018/범위 외 절 전부 naver 서술 잔존, 미갱신). `test/test-cases.md`(5a, v1.1)·`test/coverage.md`(v1.3)·`test/coverage-gap.md`(v1.3) 에 SC-009·SC-013·SC-018(naver 부분)을 카테고리 (4) 차후 점검으로 등재하고, 본 GAP 을 "참고" 등재에서 정식 (4) 항목으로 승격했다. spec.md 는 본 Test Agent 가 직접 수정하지 않는다(단일 책임 준수). 상태값(미해결) 변경 없음 — main session/Spec Agent 결정 대기.

---

## GAP-014-10

- **유형**: 보안 취약점 (High, 신규 확정 — GAP-014-07 "미확정" 항목의 CONFIRMED 전환)
- **출처**: Security Agent (SEC-001 재감사 2차, run-012 Naver 자동연동 비활성화 완화책 검증 중 발견)
- **컨텍스트**: `apps/backend/src/modules/auth/social-auth.service.ts:56-60`(path 3a, `findByProviderAndProviderId` 매칭 재로그인), `apps/backend/src/modules/auth/social/naver.provider.ts`(app-binding 검증 부재, 변경 없음)
- **상태**: OPEN — main session/사용자 결정 대기
- **내용**: Development Agent 가 run-012 에서 적용한 `AUTO_LINK_PROVIDERS` 화이트리스트 게이팅은 `SocialAuthService.login()` 의 path 3b(email 매칭 자동연동)와 path 3c 의 P2002 race fallback(email 매칭) 두 곳에만 적용되었다. **path 3a(`providerId` 매칭 재로그인, `social-auth.service.ts:56-60`)는 `autoLinkAllowed`/`AUTO_LINK_PROVIDERS` 를 전혀 참조하지 않으며, provider 와 무관하게 무조건 통과한다.** `NaverProvider.verify()` 는 (Kakao/Google 과 달리) 토큰의 app/client 바인딩을 검증하지 않으므로(GAP-014-08 근본 원인, 변경 없음), 제3자 앱(App-X)이 발급한 naver access token 을 DOA 백엔드에 재전송하면 그 토큰의 `providerId`(네이버 회원번호)가 기존 `social_accounts` 레코드(과거에 실제 naver 로그인으로 연동된 정규 DOA 고객 계정)와 일치하는 즉시, 검증 없이 그 계정의 accessToken/refreshToken 이 공격자에게 발급된다. 이는 "새로 생성되는 독립 계정"이 아니라 **이미 존재하는 실사용 계정의 완전 탈취**이며, 원 SEC-001 이 우려한 계정 탈취와 동일한 수준의 피해다.
  - GAP-014-07 "영향 범위" 절이 "path 3a(재로그인, providerId 매칭이 app-scoping 에 따라 완화될 수 있으나 미확정)"으로 남겨두었던 사항을 본 GAP 이 코드 검증으로 **CONFIRMED(미완화)** 로 확정한다. Kakao/Google 은 `verify()` 자체가 app_id/aud 를 대조하여 App-X 토큰을 최초 단계에서 거부하므로 path 3a 에 도달할 수 없다(다른 방식으로 이미 방어됨) — Naver 만 유일하게 노출된 경로다.
  - 스코핑 확인: `AuthRepository.findByProviderAndProviderId` 는 `SocialAccount.@@unique([provider, providerId])` 복합키를 사용하므로 카카오/구글 계정과의 교차 오염은 없다(naver 네임스페이스 내부로 한정).
- **영향 범위**: `SocialAuthService.login()` path 3a 전체. 사용자가 승인한 완화책(security-report.md v1.1 권고 (a) "providerId 매칭 재로그인은 유지")의 문구 자체가 이 경로를 존치 대상으로 명시했으나, 승인 당시 path 3a 자체의 app-binding 부재 위험이 재분석되지 않았다 — 따라서 이 잔존 위험은 "이미 승인된 위험 수용"으로 간주할 수 없다.
- **후속 처리**: main session/사용자가 다음 중 하나를 결정한다: (1) path 3a 도 naver 에 대해 차단(재로그인 기능 자체 상실 감내), (2) authorization code + client_secret 교환 방식으로 ADR-001 재검토(근본 해소, GAP-014-08 §완화 대안 1과 동일), (3) naver 소셜 로그인을 이번 릴리즈에서 완전 제외, (4) 명시적 위험 수용(사후 모니터링 병행 권고, context.md §6 등재). 상세 근거는 `security/security-report.md` v1.2 §SEC-001 재감사 2차 (v1.2) 참조.
- **처리 (v1.3, 본 회차) — 사용자 최종 결정: (3) Naver 이번 릴리즈 완전 제외 채택 — RESOLVED by Development Agent**: 사용자가 후속 처리 선택지 (3)을 채택했다. `SocialProviderResolver`·`SocialLoginDto`·`AuthModule`·Flutter `login_screen.dart`/`social_auth_service.dart` 에서 naver 를 완전히 제거하여, path 3a(`social-auth.service.ts:56-60`) 자체에 naver provider 문자열이 도달할 수 없다(DTO `@IsIn` 검증이 컨트롤러 진입 전 400 으로 거부). 이로써 path 3a 의 app-binding 부재로 인한 계정 탈취 위험이 "완화"가 아니라 **경로 자체가 존재하지 않게 되어 완전히 소거**되었다(GAP-014-08 처리 v1.3 참조 — 동일 커밋). 검증 상세는 GAP-014-08 v1.3 처리 절 참조(중복 기술 생략).
- **상태 갱신**: ~~OPEN~~ → **RESOLVED by Development Agent** (v1.3, Naver 이번 릴리즈 완전 제외로 path 3a 노출 경로 자체가 소거됨)
- **5b 재검증 (Test Agent EXECUTION, 본 회차)**: `social-auth.service.ts:56-60`(path 3a) 코드를 직접 Read 하여 naver 문자열이 이 라인에 도달하기 전 `SocialLoginDto`(`@IsIn(['kakao','google'])`)에서 400 으로 거부됨을 확인. path 3a 로직 자체는 무변경(diff 없음)이나 naver provider 문자열이 API 경계를 통과할 방법이 없어 이 GAP 이 우려한 공격 체인이 원천 차단됨을 재확인. RESOLVED 판정에 동의. 상세는 GAP-014-08 5b 재검증 절 참조(중복 기술 생략).
