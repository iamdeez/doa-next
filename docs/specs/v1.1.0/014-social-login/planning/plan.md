---
작성: Planning Agent
버전: v1.0
최종 수정: 2026-07-01
상태: 확정
---

# Plan: 014-social-login

> Branch: 014-social-login | Date: 2026-07-01 | Spec: [../spec/spec.md](../spec/spec.md)

## 목차

- [사전 검증 (Constitution Gates)](#사전-검증-constitution-gates)
- [기술 컨텍스트](#기술-컨텍스트)
- [외부 제공자 API 동작 검증](#외부-제공자-api-동작-검증)
- [배포 환경 영향](#배포-환경-영향)
- [핵심 설계](#핵심-설계)
- [결정 기록 (ADRs)](#결정-기록-adrs)
- [인터페이스 계약](#인터페이스-계약)
- [데이터 모델](#데이터-모델)
- [위험 완화 설계](#위험-완화-설계)
- [테스트 전략](#테스트-전략)
- [기타 고려사항](#기타-고려사항)

---

## 사전 검증 (Constitution Gates)

> constitution.md(`.claude/docs/constitution.md`) 의 P-001~P-007 조항을 기준으로 검증한다.
> **관찰**: spec NFR-001 은 "Constitution P-007 API 일반 기준(P95 1초)" 를 참조하나, 실제 constitution.md 에는 성능 P95 조항이 존재하지 않는다(P-007 = 스펙 범위 원칙). 따라서 constitution 성능 게이트와의 충돌은 없으며, NFR-001(P95 3초)은 spec 자체 기준으로 적용한다. (spec 문서의 조항 번호 오기 — 무해, REWORK 불요. Docs 단계에서 정정 권고.)

- [x] **P-001 모듈 경계 원칙**: [Pass 기준: 타 도메인 스키마 직접 참조 0건] — `social_accounts` 는 `users` 스키마에 위치하며 auth 모듈 repository 만 접근. 제공자 검증은 외부 HTTP 호출(타 모듈 DB 아님). **PASS**
- [x] **P-002 AWS 의존 금지 원칙**: [Pass 기준: AWS 전용 SDK/서비스 신규 의존 0건] — 제공자 토큰 검증은 Node 20 native `fetch` 로 처리. AWS SDK 미사용. **PASS**
- [x] **P-003 단일 DB 원칙**: [Pass 기준: 외부 데이터 저장소 신규 도입 0건] — `social_accounts` 는 기존 단일 PostgreSQL `users` 스키마 내 신규 테이블. 외부 저장소 없음. **PASS**
- [x] **P-004 클라우드 중립 원칙**: [Pass 기준: Fly.io 전용 API 비즈니스 결합 0건] — OAuth 크레덴셜은 표준 환경변수(`fly secrets` 는 배포 레이어). 비즈니스 로직에 Fly 전용 API 없음. **PASS**
- [x] **P-005 결제·정산 정합성 원칙**: [Pass 기준: 해당 없음] — 금전 상태 변경 없음. **N/A (PASS)**
- [x] **P-006 테스트 원칙**: [Pass 기준: SC-XXX 없는 FR-XXX 0건] — FR-001~015 전부 SC 대응(하단 테스트 전략 매핑표). **PASS**
- [x] **P-007 스펙 범위 원칙**: [Pass 기준: spec 범위 외 변경 파일 0건] — 변경은 backend auth 모듈 + Prisma 스키마(social_accounts·password nullable) + Flutter login/social auth + `.env.example` 로 한정. password nullable·토큰 발급 helper 추출은 각각 FR-007·FR-008 구현에 직접 필요. **PASS**

예외 사항: 없음.

> **성능 게이트 판정**: NFR-001 P95 3초 기준. 단, SC-019(측정)는 실 OAuth 크레덴셜 필요로 spec 이 명시적으로 deferred(범위 외) 처리. 파이프라인 내 모든 제공자 호출은 mock 이므로 in-pipeline 성능 측정 대상 없음. 실 측정은 운영 셋업 단계(옵션 B)에서 수행.

---

## 기술 컨텍스트

- **언어 / 런타임**:
  - 백엔드: Node.js 20 + TypeScript, NestJS (기존 `apps/backend`)
  - 모바일: Flutter (Dart, `mobile/customer_app`)
- **주요 의존성**:
  - 백엔드: `@nestjs/jwt`(기존 재사용), Prisma(기존), Node 20 global `fetch`(제공자 검증 HTTP) — **신규 npm 의존 없음**
  - 모바일: 소셜 SDK 3종 신규 추가 필요 — 후보 `kakao_flutter_sdk_user` / `google_sign_in` / 네이버 로그인 패키지. 정확한 패키지·버전은 `[TO-VERIFY: Flutter 소셜 SDK 패키지명·버전 — Design 확정]`
- **테스트 프레임워크**:
  - 백엔드: Jest (기존 unit `*.spec.ts`), e2e(deferred)
  - 모바일: `flutter_test` (widget/unit), `flutter analyze`(정적)
- **기존 재사용 대상**:
  - `AuthService` JWT 발급 로직(login) → 토큰 발급 helper 로 추출·공유 (FR-008)
  - `AuthRepository`(users 스키마 접근) → social_accounts 접근 메서드 추가
  - `JwtModule`·`jwt.config`(Access 15분/Refresh 30일)·refresh tokenHash 저장 패턴(ADR-003) 그대로 계승
  - Flutter `TokenStore`(FlutterSecureStorage)·`dioProvider`·`AuthController` 상태 전이

---

## 외부 제공자 API 동작 검증

> 본 spec 은 클라이언트 토큰 검증 방식(ADR-001)이므로 백엔드는 제공자 userinfo/tokeninfo 엔드포인트를 호출하여 providerId·email·name 을 획득한다. 아래 필드 shape 은 **본 환경에서 venv/공식문서 직접 검증 불가**(Bash·web 미제공)하여 [TO-VERIFY] 마커로 표기하고 Design(research.md)에 위임한다. (rule 10 / PATCH-002)

| 제공자 | 검증 엔드포인트(후보) | 추출 필드(후보) | 검증 방식 | 마커 |
|---|---|---|---|---|
| kakao | `GET https://kapi.kakao.com/v2/user/me` (`Authorization: Bearer {accessToken}`) | `id`→providerId, `kakao_account.email`, `kakao_account.profile.nickname`→name | Bearer 액세스 토큰 | `[TO-VERIFY: kakao user/me 응답 필드 실명 — Design 공식문서 확인]` |
| google | `GET https://oauth2.googleapis.com/tokeninfo?id_token={idToken}` | `sub`→providerId, `email`, `name`, `aud`(== GOOGLE_CLIENT_ID 검증), `email_verified` | ID 토큰 `aud`·서명 검증 | `[TO-VERIFY: google tokeninfo 필드·aud 검증 방식 — Design 공식문서 확인]` |
| naver | `GET https://openapi.naver.com/v1/nid/me` (`Authorization: Bearer {accessToken}`) | `response.id`→providerId, `response.email`, `response.name` | Bearer 액세스 토큰 | `[TO-VERIFY: naver nid/me 응답 필드 실명 — Design 공식문서 확인]` |

> **(PATCH-A07) 인정되는 한계 + 안전망**: 카카오 이메일은 **선택 동의 항목**으로, 검증된 계정이라도 사용자가 이메일 제공에 동의하지 않으면 email 이 반환되지 않을 수 있다(silent absence). 구글도 `email` scope 미허용 시 email null 가능. → 안전망: **FR-003**(이메일 미반환 시 로그인 거부, SC-005)이 이 한계를 흡수한다. 제공자별 파싱은 `SocialProviderPort` 구현체에 격리하여 필드 shape 오해가 단일 지점에 국한되도록 설계한다.
> **google 검증 방식 주의(PATCH-A07)**: `tokeninfo` 엔드포인트 대신 공식 `google-auth-library` 로컬 검증이 권장될 수 있다(네트워크 왕복 절감·서명 검증 견고). Design 이 fetch 방식(신규 의존 없음) vs 라이브러리 방식(신규 의존, 로컬 검증) trade-off 를 확정한다. ADR-002 참조.

---

## 배포 환경 영향

> (PROC-009) infra.md 운영 환경 cross-reference 결과.

- 소셜 로그인 백엔드는 **아웃바운드**로 외부 OAuth 제공자 서버(카카오·구글·네이버 API)를 호출한다. infra.md 확인: Fly.io 아웃바운드 트래픽 제한 없음, NAT/docker-proxy/L4 LB 흡수 이슈 해당 없음(인바운드 재연결 특이성과 무관).
- 크레덴셜은 `fly secrets set` 패턴(기존 SMTP/ADMIN_USER_IDS 동일)으로 dev/prod app 별 독립 주입. 신규 인프라 컴포넌트·컨테이너 구조 변경 없음.
- **결론**: critical 배포 환경 특이성 없음. Deploy Agent 비활성(selection-phases.md 근거 참조). infra.md 갱신 필요 항목: 소셜 OAuth 크레덴셜 env·아웃바운드 제공자 목록 → Docs/Retrospective 단계에서 infra.md §7 체크리스트·§8 반영 권고(GAP 아님 — 기존 아웃바운드 패턴 내).

---

## 핵심 설계

> 작성 깊이: Design Agent 가 추가 설계 판단 없이 tasks.md 를 분해 가능한 수준.

### 백엔드 — 소셜 로그인 흐름 (FR-001~009)

```
POST /auth/social-login  { provider, token }
    ↓ [AuthController.socialLogin]
    ↓ SocialAuthService.login(provider, token)
    ├─ 1) SocialProviderResolver.resolve(provider) → SocialProviderPort 구현체 선택
    │       provider ∈ {'kakao','google','naver'} 외 값 → 400 (FR-001)
    ├─ 2) port.verify(token) → { providerId, email, name }   (FR-002)
    │       email 없음 → BadRequestException 400 (FR-003, SC-005)
    │       토큰 무효 → 401/400 (FR-002, SC-006)
    ├─ 3) 계정 해석 (우선순위, ADR-003):
    │     a. findByProviderAndProviderId(provider, providerId)
    │          존재 → user = account.user               (FR-004, SC-001)
    │     b. else findUserByEmail(email)
    │          존재 → createSocialAccount(user.id, ...)  (FR-005, SC-002, 자동 연동)
    │     c. else createUser({email, name, password:null})
    │              + createSocialAccount(user.id, ...)   (FR-006/007, SC-003/004)
    ├─ 4) issueTokensForUser(user) → { accessToken, refreshToken }  (FR-008)
    │       (기존 login() 토큰 발급 로직을 공유 helper 로 추출)
    └─ 응답: { accessToken, refreshToken }
```

**신규/변경 모듈 (backend `apps/backend/src/modules/auth/`)**:

| 파일 | 유형 | 내용 |
|---|---|---|
| `social/social-provider.port.ts` | 신규 | `abstract class SocialProviderPort { abstract verify(token: string): Promise<SocialProfile> }`. `SocialProfile = { providerId: string; email: string \| null; name: string \| null }` |
| `social/kakao.provider.ts` | 신규 | KakaoProvider — kapi user/me 호출·파싱 (`[TO-VERIFY]` 필드) |
| `social/google.provider.ts` | 신규 | GoogleProvider — tokeninfo 검증·`aud` 대조 (`[TO-VERIFY]`) |
| `social/naver.provider.ts` | 신규 | NaverProvider — nid/me 호출·파싱 (`[TO-VERIFY]`) |
| `social/social-provider.resolver.ts` | 신규 | provider 문자열 → Port 구현체 매핑. 미지원 값 → BadRequest |
| `social/stub-social.provider.ts` | 신규 | 테스트용 stub(무네트워크). SC-001~010 단위 검증에서 주입 (NFR-004 mock, ASM-002) |
| `social-auth.service.ts` | 신규 | 위 계정 해석 흐름 오케스트레이션 |
| `dto/social-login.dto.ts` | 신규 | `{ provider: 'kakao'\|'google'\|'naver'; token: string }` class-validator |
| `auth.controller.ts` | 수정 | `POST /auth/social-login` 라우트 추가 |
| `auth.service.ts` | 수정 | `issueTokensForUser(user)` private helper 추출 (login 과 공유, 동작 불변) |
| `auth.repository.ts` | 수정 | social_accounts CRUD 메서드 + createUser 확장(name·password null 허용) |
| `auth.module.ts` | 수정 | providers 등록 + Port DI 바인딩(운영=실 provider, 테스트=stub) |

**분기 핵심 로직**:
- 계정 해석은 **엄격한 우선순위**(a→b→c). a 에서 매칭되면 b/c 진입 금지(재로그인은 신규 연동/생성 없음).
- provider identifier 화이트리스트: `'kakao' | 'google' | 'naver'` 만 허용(DTO enum 검증 + resolver 이중 방어).

### 백엔드 — 스키마 (FR-009)

`social_accounts` 테이블(`users` 스키마). 상세 컬럼·제약·마이그레이션은 **Database Design Agent** 가 확정(selection-phases.md Y). Planning 제안 형태는 [데이터 모델](#데이터-모델) 참조.

### Flutter — 소셜 버튼 활성화 및 인증 흐름 (FR-010~015)

```
_SocialRow 각 버튼 (GestureDetector.onTap)
    ↓ SocialAuthService.signInWith{Kakao|Google|Naver}()
    ├─ SDK 인증 → providerToken 획득
    │     사용자 취소 → SocialAuthCancelled 예외 → 조용히 복귀(오류 미표시)  (FR-014, SC-015)
    ├─ POST /auth/social-login {provider, token} (dio)
    │     실패(4xx/네트워크) → 오류 메시지 표시 + 이메일 로그인 안내  (FR-015, SC-016)
    └─ 성공 → TokenStore.save(access, refresh) → AuthController 상태 authenticated → 메인 전환  (FR-013, SC-014)
```

**신규/변경 (Flutter `mobile/customer_app/lib/`)**:

| 파일 | 유형 | 내용 |
|---|---|---|
| `features/auth/social_auth_service.dart` | 신규 | `abstract class SocialAuthService`(테스트 mock 가능) + provider별 구현. 반환: `{provider, token}` 또는 취소 예외 |
| `features/auth/login_screen.dart` | 수정 | `_SocialRow` 를 `ConsumerStatefulWidget`/콜백 구조로 전환, 각 소셜 원형 버튼을 `GestureDetector`(onTap) 로 래핑(SC-011/012/013). 성공/취소/실패 처리 |
| `core/providers.dart` | 수정 | `socialAuthServiceProvider` 추가 + `AuthController.socialLogin(provider, token)` 메서드(백엔드 호출·토큰 저장·상태 전이) |

> **Flutter SDK 네이티브 설정**(Info.plist·AndroidManifest·deep link·앱 키)은 운영 셋업 단계 deferred(ASM-002). 파이프라인 검증(SC-011~016)은 `SocialAuthService` 인터페이스 mock 으로 SDK 무의존 단위 검증.

---

## 결정 기록 (ADRs)

| ADR-ID | 결정 항목 | 채택안 | 대안 (검토했으나 채택 안 함) | 근거 (spec FR/NFR 참조) | 영향 범위 |
|---|---|---|---|---|---|
| ADR-001 | OAuth 인증 흐름 | 클라이언트 토큰 검증 방식(앱 SDK 로 토큰 획득 → 백엔드는 검증만) | (A) 서버 authorization code 교환(모바일 deep link UX 복잡) | FR-001, FR-002 (spec-input Q-OAuth 채택 B) | auth 모듈·Flutter 전반 |
| ADR-002 | 백엔드 토큰 검증 수단 | Node 20 native `fetch` 로 제공자 userinfo/tokeninfo 직접 호출 + 제공자별 Port 구현 | (1) passport-*-oauth 전략(서버 code 교환 전제, 흐름 불일치) / (2) 각 제공자 공식 SDK(신규 의존 다수) / (3) google-auth-library(google 로컬 검증 — Design 재검토 여지) | FR-002, P-002(AWS/의존 최소), NFR-001 | auth 모듈. `[TO-VERIFY]` google 검증 방식 Design 확정 |
| ADR-003 | 계정 해석 우선순위 | providerId 매칭 → email 매칭 자동연동 → 신규 생성 (엄격 순차) | (B) 이메일 검증 후 연동(UX 복잡, ASM-001 로 불요) / (C) 항상 신규 계정(users.email unique 위반·중복) | FR-004, FR-005, FR-006, NFR-002, ASM-001/005 | social-auth.service |
| ADR-004 | social_accounts 저장 구조 | `users` 스키마 신규 테이블, users 와 1:N, `@@unique([provider, providerId])` | 단일 user 행에 provider 컬럼 인라인(복수 제공자 연동 불가) | FR-009 | Prisma 스키마·auth repo. 상세 Database Design Agent 확정 |
| ADR-005 | User.password nullable 전환 | `password String?` 로 변경(기존 행 영향 없는 additive), 소셜 전용 사용자 password=null | sentinel/랜덤 password 저장(로그인 우회 위험·의미 왜곡) | FR-007, NFR-003 | schema.prisma User·auth.service login() null 가드 |
| ADR-006 | JWT 발급 공유 | `AuthService.issueTokensForUser(user)` private helper 로 추출, login·social-login 공유(동작 불변) | social-login 에서 발급 로직 중복 구현(불일치·유지보수 부담) | FR-008 | auth.service(동작 보존 리팩터) |
| ADR-007 | OAuth 크레덴셜 env 스킴 | 제공자별·환경별 독립 env(dev/prod app 별 fly secret). 후보: `KAKAO_REST_API_KEY`·`GOOGLE_CLIENT_ID`·`NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET` | 단일 공용 앱(개발/운영 혼용 — 보안·격리 위배) | NFR-004, ASM-004, SC-018 | `.env.example`·운영 secret. 정확 필드 `[TO-VERIFY: 제공자 콘솔 크레덴셜 요구사항 — Design 확정]` |

> 본 표는 Design Agent 의 research.md "기술 선택 조사" 절과 cross-reference 한다. `[TO-VERIFY]` 항목(ADR-002 google 검증·ADR-007 크레덴셜 필드)은 Design 이 공식문서로 확정한다.

---

## 인터페이스 계약

### 신규 엔드포인트

`POST /auth/social-login` (인증 불요 — anonymous)
- 요청: `{ provider: 'kakao'|'google'|'naver', token: string }`
- 응답 200: `{ accessToken: string, refreshToken: string }` (기존 login 과 동일 형식, FR-008)
- 오류: 400(미지원 provider·email 미반환·토큰 무효), 401(토큰 검증 실패)

### 권한 부여·상태 전이 인가 3축 (PATCH-001 / PROC-003)

> 소셜 로그인은 **신규 인증 진입점**(로그인 자체)이므로 기존 사용자 자원 소유권/역할 개념이 아니라 **제공자 토큰 신원 확립**이 인가의 본질이다.

| 엔드포인트 | (a) 호출자 신원(인증) | (b) 대상 자원 소유권 | (c) 역할(admin 등) | 미검증 축 위험·후속 |
|---|---|---|---|---|
| `POST /auth/social-login` | 제공자 토큰 검증으로 신원 확립(FR-002). 토큰 무효 시 거부 | 자동 연동 시 대상=email 일치 기존 계정. 소유권 검증 = **제공자 이메일 신뢰(ASM-001/NFR-002)** | 없음(로그인은 역할 무관) | (b) 축이 제공자 이메일 신뢰에 의존 → **계정 탈취 표면**. 제공자가 미검증 이메일을 반환하면 자동연동 오남용 가능. Security Agent 검토 대상(활성). FR-003(email 없으면 거부)·providerId 우선 매칭(ADR-003 a)이 1차 완화 |

> **Security Agent 위임 포인트**: 자동 연동(FR-005)의 이메일 신뢰 모델(ASM-001)은 계정 탈취 벡터이므로 6단계 Security Agent 가 (1) 제공자별 email_verified 플래그 활용 가능성, (2) providerId 우선 매칭의 회귀 방어, (3) 토큰 `aud`(google) 대조 누락 위험을 감사한다.

### 기존 인터페이스 하위 호환 (User.password nullable)

- `User.password: String → String?` 전환은 **기존 행에 영향 없음**(모든 기존 사용자는 password 보유). 신규 소셜 전용 사용자만 null.
- **방어 코드 필수 지점**: `AuthService.login()` 의 `bcrypt.compare(input.password, user.password)` — `user.password === null` 이면 즉시 `UnauthorizedException('Invalid credentials')`(NFR-003, SC-004). null 을 compare 에 전달 금지.
- `register()`·`resetPassword()`: password 를 채우는 경로이므로 non-null 유지(영향 없음).
- **grep 확인 위임**: `apps/backend/**` 에서 `.password` 접근 지점이 auth 모듈 외에 없는지 Design/Development 가 재확인(현재 read 기준 auth.service·auth.repository 한정). Breaking 잔여 참조 0건 검증(03-verification §1-4).

---

## 데이터 모델

> 상세 확정은 **Database Design Agent**(3단계 후) 담당. 아래는 Planning 제안 형태.

`social_accounts` (schema: `users`)

| 컬럼 | 타입 | 제약 |
|---|---|---|
| id | String @id @default(cuid()) | PK |
| userId | String | FK → users.users.id (onDelete: Cascade) — **동일 스키마 내이므로 FK 선언 가능**(P-001 위배 아님) |
| provider | String | 'kakao'\|'google'\|'naver' |
| providerId | String | 제공자 내부 고유 ID |
| email | String | 연동 시점 제공자 이메일 |
| name | String? | 제공자 이름(선택) |
| createdAt | DateTime @default(now()) | |

- `@@unique([provider, providerId])` — 동일 소셜 계정 중복 연동 차단(FR-004 재로그인 판정 기준·동시성 방어).
- `@@index([userId])` — 사용자별 연동 목록 조회.
- User 모델에 `socialAccounts SocialAccount[]` relation 추가(1:N, FR-009).
- User.password: `String` → `String?` (ADR-005, FR-007).

---

## 위험 완화 설계

> (PATCH-A06) assumptions.md 중 "확인 필요=예 + 운영/Planning 검증" 항목의 안전망.

| ASM | 위험 | 안전망 |
|---|---|---|
| ASM-004 (Planning 확인 — 제공자 콘솔 크레덴셜 요구사항) | 실 크레덴셜 필드·redirect·bundle ID 미확정 → 운영 배포 시 검증 실패 | (1) env 스킴을 ADR-007 로 고정, 정확 필드는 `[TO-VERIFY]` Design 위임. (2) 파이프라인 검증은 stub provider 로 크레덴셜 무의존(ASM-002). (3) 사후 운영 검증(옵션 B, spec Out of Scope PROC-014)에서 실 크레덴셜 1회 점검 |
| ASM-001 (제공자 이메일 신뢰 — 자동연동) | 미검증 이메일 반환 시 계정 탈취 | (1) FR-003 email 미반환 거부. (2) providerId 우선 매칭(ADR-003 a)으로 재로그인은 이메일 무관. (3) Security Agent(활성) 감사. (4) google `aud` 대조·`email_verified` 활용을 Design/Security 확정 |
| 외부 API 필드 shape 오해([TO-VERIFY]) | 제공자 응답 파싱 실패 → 로그인 오류 | (1) 제공자별 `SocialProviderPort` 구현에 파싱 격리(단일 지점). (2) Design 이 공식문서로 필드 확정. (3) stub provider 로 흐름 검증 후 실 provider 는 운영 검증 |

---

## 테스트 전략

> (PROC-010) 옵션 자가 점검 — 실 제공자 e2e(SC-019 + 실 OAuth 흐름)는 **옵션 B(사용자 직접 검증)** 채택(spec Out of Scope 명시).
> 1. 운영 환경 의존성: **Y** — 실 OAuth 제공자 네트워크·실 크레덴셜·기기 native SDK·deep link redirect 에 의존.
> 2. mock 불가 시나리오: **Y** — 실 토큰 발급/검증, 제공자 동의 화면, 앱↔제공자 앱 전환.
> 3. 권장: 옵션 B 유지(기기 검증). 파이프라인 내 SC(SC-001~018)는 stub/mock 으로 단위·정적 검증. 사후 피드백 사이클은 spec Out of Scope §사후 운영 검증(PROC-014)에 명시됨.

| SC | 테스트 수준 | 유형 | 시나리오 유형 | 입력 | 기대 결과 |
|---|---|---|---|---|---|
| SC-001 (FR-004) | 단위 | 통합흐름 | Happy | 기연동 소셜계정(provider+providerId) stub | accessToken·refreshToken 반환, 신규 생성/연동 없음 |
| SC-002 (FR-005) | 단위 | 통합흐름 | Happy | 미연동 소셜계정, email=기존 계정 이메일 | 기존 계정에 social_account 연동 + 토큰 반환 |
| SC-003 (FR-006) | 단위 | 통합흐름 | Happy | 신규 email(기존 계정 없음) | 신규 user 생성 + social_account + 토큰 반환 |
| SC-004 (FR-007,NFR-003) | 단위 | 방어 | Error | SC-003 계정으로 email+password 로그인 시도 | user.password=null → 401 Unauthorized |
| SC-005 (FR-003) | 단위 | 방어 | Error | stub provider email=null 반환 | 400 (email 미반환 거부) |
| SC-006 (FR-002) | 단위 | 방어 | Error | 무효 토큰(stub verify throw) | 4xx 오류 |
| SC-007 (FR-001,002) | 단위 | 제공자분기 | Happy | provider='kakao' | 카카오 verify 경로 수행 + JWT |
| SC-008 (FR-001,002) | 단위 | 제공자분기 | Happy | provider='google' | 구글 verify 경로 수행 + JWT |
| SC-009 (FR-001,002) | 단위 | 제공자분기 | Happy | provider='naver' | 네이버 verify 경로 수행 + JWT |
| SC-010 (FR-009) | 단위 | 데이터 | Happy | 소셜 로그인 성공 후 | social_accounts 에 provider·providerId·email·name 레코드 존재 |
| SC-011 (FR-010) | 정적 | 위젯존재 | Happy | LoginScreen 카카오 버튼 | GestureDetector/onTap 핸들러 존재 |
| SC-012 (FR-011) | 정적 | 위젯존재 | Happy | 구글 버튼 | 탭 가능 + 핸들러 존재 |
| SC-013 (FR-012) | 정적 | 위젯존재 | Happy | 네이버 버튼 | 탭 가능 + 핸들러 존재 |
| SC-014 (FR-013) | 단위 | 흐름 | Happy | mock SocialAuthService 성공 + 백엔드 JWT | TokenStore 저장 + authenticated 전이(메인 전환) |
| SC-015 (FR-014) | 단위 | 흐름 | Edge | mock 취소 예외(SocialAuthCancelled) | 로그인 화면 유지, 오류 메시지 미표시 |
| SC-016 (FR-015) | 단위 | 흐름 | Error | mock 실패(4xx/네트워크) | 오류 메시지 표시 |
| SC-017 (NFR-005) | 정적 | analyze | — | `flutter analyze` | 0 issues |
| SC-018 (NFR-004) | 정적 | env | — | `.env.example` | 카카오·구글·네이버 크레덴셜 env 항목 존재 |
| SC-019 (NFR-001) | e2e | 성능 | Happy | 실 OAuth 흐름 | P95 ≤ 3초 — **deferred(옵션 B, 범위 외)** |

> **시나리오 유형 커버리지**: Happy(SC-001/002/003/007/008/009/010/011/012/013/014) · Edge(SC-015 취소) · Error(SC-004/005/006/016) 세 유형 모두 커버.

### smoke_tests

- 필요 여부: **Y**
- 대상 경로:
  - `apps/backend/src/modules/auth/auth.service.spec.ts` (기존 email 로그인/register/refresh/reset 단위)
- 근거: ADR-005(User.password nullable) + login() null 가드 추가가 기존 이메일 로그인 경로에 회귀를 유발할 수 있다. 기존 auth 단위 스위트를 SC 매핑 테스트와 함께 실행하여 email 로그인·비밀번호 재설정 회귀 0 확인.

---

## 기타 고려사항

- **동시성 (신규 소셜 사용자 레이스)**: 동일 email/providerId 로 최초 소셜 로그인이 동시 2회 발생 시 — `users.email @unique` + `social_accounts @@unique([provider,providerId])` 가 DB 수준 방어. 한쪽이 unique 위반 시 서비스는 위반을 포착하여 "재조회 후 연동/재로그인"(ADR-003 a→b 재시도)으로 폴백. Development 는 이 충돌 경로에 방어 코드(catch → 재해석) 포함. Check-Then-Act 구간(조회→생성)은 DB unique 제약이 최종 정합성 보장.
- **email null 타입**: `SocialProfile.email: string | null` 로 두어 FR-003 분기를 타입 수준에서 강제(제공자 파싱 후 null 체크 누락 방지).
- **google 검증 방식**: ADR-002 대안(3) google-auth-library 로컬 검증은 신규 의존이나 tokeninfo 왕복 제거·서명 검증 견고. Design 이 fetch vs 라이브러리 확정. 라이브러리 채택 시 npm 신규 의존 1건 → P-002(AWS 아님, 무관)·NFR-001 영향 재평가.
- **ASM-003 (소셜 전용 사용자 OTP 재설정)**: password=null 사용자가 forgot-password 요청 시 현재 동작(OTP 발급→resetPassword 로 password 설정)은 변경하지 않음(범위 외). 부작용: 소셜 전용 사용자가 email OTP 로 password 를 획득 가능 — 의도된 현행 유지, 후속 spec 검토.
- **Flutter 소셜 SDK 네이티브 설정**: 앱 키·Info.plist·AndroidManifest·deep link 는 운영 셋업(ASM-002 deferred). 파이프라인은 인터페이스 mock 검증.
- **[TO-VERIFY] 일관성(PATCH-002)**: 외부 제공자 응답 필드·google aud 검증·크레덴셜 필드는 코드 예시가 아닌 설계 표에서 `[TO-VERIFY]` 마커로 표기했고 위임 노트와 일치시켰다. 확정값처럼 리터럴을 쓰지 않았다.
