---
작성: Spec Agent
버전: v1.1
최종 수정: 2026-07-03 [시각 미확인]
상태: 확정
---

# Spec Input: 015-naver-code-exchange

> 수집 일시: 2026-07-03 [시각 미확인] | 사용자 최종 확인: 완료 (코디네이터 경유 Q-A~Q-D 확정 답변 수령)

## 목차

- [수집 진행 상태](#수집-진행-상태)
- [질문 분석 근거](#질문-분석-근거)
- [카테고리별 수집 내용](#카테고리별-수집-내용)
- [기존 working tree 수정 통합](#기존-working-tree-수정-통합)
- [선행 spec 영향 추적](#선행-spec-영향-추적)
- [보완 내용](#보완-내용)

---

## 수집 진행 상태

| 카테고리 | 상태 | 마지막 질문 번호 | 답변 완료 항목 |
|---|---|---|---|
| 1. 배경 및 목적 | 완료 (014 산출물 근거로 확정) | Q1~Q3 | [Q1, Q2, Q3] |
| 2. 사용자 & 이해관계자 | 완료 (014 승계) | Q4~Q6 | [Q4, Q5, Q6] |
| 3. 핵심 기능 | 완료 — Q-A 확정(Naver만 code-exchange, 혼합) | Q7~Q9 | [Q7, Q8, Q9] |
| 4. 데이터 & 입출력 | 완료 | Q10~Q12 | [Q10, Q11, Q12] |
| 5. 제약조건 | 완료 — Q-B·Q-C 확정 | Q13~Q16 | [Q13, Q14, Q15, Q16] |
| 6. 운영 환경 | 완료 — Q-C 딥링크 방식 확정(정확한 값은 Design 위임) | Q17~Q19 | [Q17, Q18, Q19] |
| 7. 예외 & 실패 시나리오 | 완료 — Q-D 확정(자동연동 재허용) | Q20~Q22 | [Q20, Q21, Q22] |

> 사용자 최종 확인 완료. 4개 결정 항목(Q-A~Q-D) 코디네이터 경유 확정 답변 수령 — 전 카테고리 완료. spec.md 작성 완료(`spec/spec.md`).

---

## 질문 분석 근거 (Question Analysis Basis)

> (PROC-015) 아래 4개 항목은 본 Agent 의 코드·문서 분석에 근거해 옵션을 구성했다. 사용자(코디네이터 경유) 답변을 "채택 결과" 열에 확정 반영했다.

| 질문 ID | 요지 | 옵션별 근거·trade-off | 추천안(이유) | 채택 결과 |
|---|---|---|---|---|
| Q-A | Naver 만 code-exchange 로 전환하고 카카오·구글은 기존 client-token 방식을 유지(혼합)할지, 3개 provider 전부를 code-exchange 로 통일할지 | **A(혼합, naver만 전환)**: 카카오·구글은 014 v1.3 재감사에서 SEC-001 이 완전 해소됨(app_id/aud 검증)이 코드로 확정되어 안전 상태. 재작업 시 불필요한 회귀 위험 + constitution P-007(스펙 범위 원칙) 저촉 소지(사용자 원 요청은 "Naver 재도입"에 한정). / **B(전체 통일)**: 아키텍처 일관성 확보되나 안정 동작 중인 카카오·구글 흐름 재설계 필요 — 범위 대폭 확대, 검증된 kakao.provider.spec.ts·google.provider 회귀 위험, 사용자 원 요청 범위 초과 | **A (혼합)** — 사용자 원 요청이 "Naver 재도입"으로 명시적 한정되어 있고, 카카오·구글은 이미 별도 방식(app_id/aud 검증)으로 SEC-001 이 완전 해소된 상태이므로 재작업 근거 부재 | **채택: A (혼합) — 확정.** Naver 만 code-exchange 전환, 카카오·구글은 client-token 방식 무변경. 본 spec 범위는 Naver 재도입에 한정. |
| Q-B | Naver `client_secret` 조달 방식 — 014 ADR-007(제공자별 env, 실 크레덴셜은 운영 셋업 단계 발급, 파이프라인 검증은 stub) 패턴을 그대로 따를지 | **A(014 ADR-007 패턴 계승, 추천)**: `NAVER_CLIENT_SECRET`은 `.env.example`에 이미 존재(014 당시 미사용 placeholder) — 이번 spec에서 처음 실사용 시작. `getOrThrow` 호출 시점 지연(카카오/구글과 동일, GAP-014-04 패턴)으로 미설정 시 앱 전체 기동에 영향 없음(fail-closed, verify() 호출 시에만 실패). 실 값 발급·Fly secret 주입은 운영 셋업 단계 deferred, 파이프라인 검증은 stub. / **B(신규 조달 절차 수립)**: 별도 프로세스 필요성 근거 없음 — 기존 패턴과 다르게 할 이유가 없음 | **A** — 기존 카카오/구글/기타 크레덴셜(KAKAO_APP_ID·GOOGLE_CLIENT_ID·SMTP_*)과 완전히 동일한 운영 패턴이며 이미 검증된 안전한 방식 | **채택: A — 확정.** 014 패턴 계승. `NAVER_CLIENT_SECRET`(기존 placeholder)을 verify/exchange 시점 지연 조회로 fail-closed. 실 값은 운영 셋업 단계 발급, 파이프라인 검증은 stub/mock. spec.md 에는 "환경변수로 관리하는 client_secret 로 서버가 code 를 교환" 수준의 WHAT 만 기재(NFR-002). |
| Q-C | 모바일에서 authorization code 를 획득하는 방식(redirect URI/딥링크 구성) — 시스템 브라우저 + 커스텀 URL 스킴 리다이렉트 vs 인앱 WebView 방식 | **A(시스템 브라우저 + 커스텀 URL 스킴, 추천)**: OAuth 보안 모범사례(Google 은 인앱 WebView 기반 OAuth 를 2016 년부터 정책적으로 차단 — 호스트 앱이 인증 자격증명에 개입 가능한 위험). `mobile/customer_app/pubspec.yaml` 확인 결과 커스텀 스킴 캡처 패키지(`app_links`/`uni_links`/`flutter_web_auth_2` 등) 및 기존 딥링크 인프라 전무 — 신규 도입 필요, 정확한 패키지·스킴 값은 Design 단계 `[TO-VERIFY]`(014 ASM-002 와 동일 위임 패턴). / **B(인앱 WebView)**: 신규 패키지 불요(WebView 임베드로 처리 가능)하나 보안 모범사례 위배(제3자 웹뷰 내 자격증명 입력은 host 앱의 JS 인젝션·쿠키 접근 위험), 최근 OAuth 제공자들이 웹뷰 기반 흐름을 차단하는 추세(네이버도 웹뷰 UA 차단 정책 가능성 `[TO-VERIFY]`) | **A (시스템 브라우저 + 커스텀 스킴)** — 보안 모범사례 부합. 정확한 스킴 문자열·Flutter 패키지 선정는 spec 범위(WHAT) 밖 — Design/Planning 이 `[TO-VERIFY]`로 확정(014 선례와 동일 위임) | **채택: A — 확정.** 시스템 브라우저 + 커스텀 URL 스킴 리다이렉트. 인앱 WebView 명시적 금지(보안 모범사례). 정확한 Flutter 패키지·URL 스킴 값은 Design 단계 `[TO-VERIFY]` 위임(014 ASM 패턴, ASM-001 로 기록). |
| Q-D | Naver 를 `AUTO_LINK_PROVIDERS`(FR-005 자동연동 화이트리스트)에 재등록할지 — code-exchange 는 서버가 자신의 `client_secret` 으로만 code 를 교환할 수 있어 타 앱이 발급받은 code 를 재전송해도 교환 자체가 불가능하므로 SEC-001/GAP-014-08/GAP-014-10 이 우려한 "타 앱 발급 토큰 재전송" 전제 자체가 성립하지 않게 됨 | **A(재허용, 추천)**: code-exchange 표준 흐름에서는 authorization code 가 특정 `client_id`+`redirect_uri` 조합에 귀속되고, 그 code 로 access_token 을 얻으려면 `client_secret`(백엔드만 보유)이 필수이므로, 공격자가 제3자 앱에서 얻은 code/token 을 그대로 DOA 백엔드에 재전송해도 (1) code 재전송 시 redirect_uri 불일치로 네이버가 거부하거나 (2) 애초에 attacker 가 DOA 의 client_secret 을 모르므로 자신의 code 를 DOA 앱 명의로 교환할 수 없음 — 근본 공격 벡터가 프로토콜 수준에서 소거됨(카카오 app_id 대조·구글 aud 대조와 동등하거나 더 강한 보장). / **B(계속 차단, providerId 매칭 재로그인만 허용)**: 방어적으로 유지하되 근거 없는 보수적 선택 — 새 방식의 보안 이득을 활용하지 못함, FR-005 사용자 경험 저하(기존 이메일 계정과 병합 안 됨). / **C(위험수용 별도 결정 보류)**: 검증 지연 | **A (재허용)** — code-exchange 자체가 GAP-014-08 근본 원인(앱 바인딩 검증 수단 부재)을 완전히 해소하는 방식이므로, 자동연동 차단이라는 완화책(GAP-014-08 v1.2 조치)을 유지할 안보상 근거가 사라짐. 단, Security Agent 6단계 재감사로 최종 확인 필요(spec.md 에 "Security Agent 검토 대상"으로 명시 예정) | **채택: A — 확정.** Naver 를 `AUTO_LINK_PROVIDERS`에 재편입(카카오·구글과 동일하게 이메일 자동연동 대상 포함). spec.md NFR-003 에 code-exchange 앱 바인딩 근거 + "6단계 Security Agent 최종 재감사 대상" 명시. |

---

## 카테고리별 수집 내용

### [카테고리 1] 배경 및 목적

- **Q1 (왜 만드는가)**: 014-social-login 은 Naver 소셜 로그인을 SEC-001(네이버 공개 API 에 access token 의 app/client 바인딩을 식별하는 공개 엔드포인트가 없어, 제3자 앱이 발급받은 토큰을 그대로 재전송해도 구분 없이 신뢰되는 근본 설계 결함 — GAP-014-07/08/10)을 근거로 **이번 릴리즈에서 완전 제외**했다(`SocialProviderResolver`·`SocialLoginDto`·`AuthModule`·Flutter `_SocialRow`/`SocialAuthService` 어디에도 naver 미와이어, `naver.provider.ts` 파일만 참조용 보존). 본 spec 은 **서버 사이드 authorization code + client_secret 교환 방식**(OAuth 2.0 Authorization Code Grant 의 표준 서버 플로우)으로 Naver 를 안전하게 재도입한다. 이 방식은 백엔드가 자신만 아는 `client_secret` 으로 code 를 access_token 으로 교환하므로, 발급된 토큰이 DOA 앱에 귀속됨이 OAuth 프로토콜 수준에서 보장되어 SEC-001/GAP-014-08/GAP-014-10 이 지적한 계정 탈취 공격 체인(path 3a/3b/3c) 의 전제 자체가 성립하지 않는다.
- **Q2 (기존 방식의 한계)**: 현재 카카오·구글은 클라이언트 토큰 검증 방식(모바일 SDK 가 획득한 access/id token 을 백엔드가 제공자 API 로 대조 검증)으로 활성화되어 있고, 각각 `app_id`(카카오 access_token_info)·`aud`(구글 tokeninfo) 대조로 앱 바인딩을 확보해 안전하다(014 v1.3 Security 최종 감사 RESOLVED). Naver 는 이 방식에 대응하는 앱 바인딩 검증 수단을 네이버 오픈API 가 제공하지 않아(공식 문서 조사 결과, Development Agent 014 run 조사·Security Agent 교차 확인) 동일 방식 적용이 근본적으로 불가능했고, 그 결과 이번 릴리즈에서 완전 제외되었다. 소비자는 현재 Naver 계정으로 DOA Market 에 로그인할 수 없다.
- **Q3 (성공 판단 기준)**: (1) Naver 소셜 로그인이 서버 사이드 code-exchange 로 정상 동작(신규 가입·재로그인 검증 가능), (2) 기존 `SocialAuthService` 계정해석 3단계(providerId 매칭→email 자동연동→신규가입)·JWT 발급 인프라를 재사용, (3) Security Agent 재감사에서 Naver 관련 Critical/High 취약점 0건 판정, (4) 카카오·구글의 기존 동작(회귀 0)이 그대로 유지되는 것.

### [카테고리 2] 사용자 & 이해관계자

- **Q4**: DOA Market 소비자(Flutter 고객 앱 사용자) 중 네이버 계정 보유자.
- **Q5**: 일반 소비자, 기술 수준 무관 — 버튼 탭 1회로 완결되는 흐름이어야 함(카카오·구글과 동일 UX 수준 유지).
- **Q6**: 개발팀(014 SEC-001 이력 관계자), Security Agent(6단계 재감사 대상), 향후 마케팅/CS(네이버 로그인 사용률이 높은 국내 시장 특성상 이탈 고객 회복 이해관계자).

### [카테고리 3] 핵심 기능

- **Q7 (필수 기능, 우선순위 순)**:
  1. Flutter `LoginScreen` 의 네이버 소셜 버튼 재활성화.
  2. Flutter 는 네이버 인증 화면(웹 기반 흐름, Q-C 참조)을 열어 **authorization code** 를 획득 — 기존 카카오/구글처럼 access/id token 을 직접 획득하는 방식이 **아님**(핵심 차이점).
  3. 획득한 code 를 백엔드 `POST /auth/social-login` (또는 필요 시 신규 code-exchange 전용 필드)에 전달.
  4. 백엔드 `NaverProvider`(재작성) 가 `NAVER_CLIENT_ID`+`NAVER_CLIENT_SECRET`+code 로 네이버 토큰 엔드포인트(`https://nid.naver.com/oauth2.0/token`)와 교환하여 `access_token` 을 획득 — **이 access_token 은 백엔드 내부에서만 사용되고 클라이언트에 노출되지 않는다**.
  5. 획득한 access_token 으로 기존 `/v1/nid/me` 호출 로직(기존 `naver.provider.ts` 파싱 로직 재사용 가능)으로 프로필(providerId·email·name) 획득.
  6. 기존 `SocialAuthService` 계정해석 3단계·JWT 발급 흐름을 그대로 재사용(naver 를 `SocialProviderResolver`·`SocialLoginDto` 화이트리스트에 재등록).
  7. **[확정 — Q-A: A 채택]** 카카오·구글은 기존 client-token 방식을 그대로 유지(무변경). 본 spec 범위는 Naver 재도입에 한정한다.
- **Q8 (있으면 좋은 기능)**: 명시 없음.
- **Q9 (Out of Scope 확인)**:
  - 카카오·구글의 code-exchange 전환(Q-A 확정에 따라 명시적 범위 외 — 이미 SEC-001 해소 완료로 필요성 없음).
  - 실 네이버 앱 등록·크레덴셜 실 값 발급(운영 셋업 단계 deferred, 014 와 동일 패턴).
  - 실 네이버 인증 흐름 E2E 검증(옵션 B, 사용자 직접 검증 — 014 PROC-014 패턴 계승).
  - 소셜 계정 연동 해제·목록 조회·프로필 이미지(014 범위 외 승계).
  - PKCE(Proof Key for Code Exchange) 추가 도입 — 네이버 오픈API 의 PKCE 지원 여부 `[TO-VERIFY]`, 미지원 시 client_secret 교환만으로 충분(표준 confidential client 흐름).

### [카테고리 4] 데이터 & 입출력

- **Q10 (주요 데이터)**: authorization code(Flutter→백엔드, 1회성·단기유효), `state` 파라미터(CSRF 방지용, OAuth 표준), `NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET`(백엔드 env, 서버 전용), `access_token`(교환 후 백엔드 내부 전용, **클라이언트에 어떤 경로로도 반환하지 않음** — 핵심 불변조건), 프로필(providerId/email/name).
- **Q11 (외부 시스템 연동)**: 신규 아웃바운드 1건 추가 — 네이버 토큰 엔드포인트(`https://nid.naver.com/oauth2.0/token`, POST). 기존 프로필 조회(`https://openapi.naver.com/v1/nid/me`)는 재사용(호출 주체가 클라이언트 토큰이 아닌 서버 교환 토큰으로 변경).
- **Q12 (민감도)**: `client_secret` 은 최고 민감도 — 어떤 경우에도 클라이언트(Flutter 앱)·로그·응답 바디에 노출 금지. authorization code 는 1회용·단기유효(통상 수분 이내)이나 탈취 시 악용 가능하므로 로그에 원문 기록 금지(마스킹). access_token 은 서버 메모리 내 일시 보유 후 폐기, 저장하지 않음(기존 카카오/구글도 미저장 — 동일 정책).
- **Q12-1**: 해당 없음(목록형 응답 없음).

### [카테고리 5] 제약조건

- **Q13 (기술 스택 제약)**: 백엔드는 기존 NestJS/Node 20 native `fetch` 유지(신규 npm 의존 없음 — 토큰 교환은 `application/x-www-form-urlencoded` POST 로 처리 가능). Flutter 측은 authorization code 획득을 위한 웹 기반 인증 흐름 처리 패키지가 신규로 필요할 가능성이 높음(`pubspec.yaml` 확인 결과 커스텀 스킴 캡처 패키지 전무) — 정확한 패키지명·버전은 Design 단계 `[TO-VERIFY]`(014 ASM-002 와 동일 위임 패턴, Q-C 참조).
- **Q14 (일정 제약)**: 명시 없음.
- **Q15 (성능 요구사항)**: 014 NFR-001(API 응답 P95 3초 이내, 외부 제공자 네트워크 포함) 패턴을 계승한다. Naver 경로는 외부 순차 호출이 기존 1회(프로필 조회)에서 2회(토큰 교환 + 프로필 조회)로 증가하나, 기존 NFR-001 이 이미 "외부 제공자 사용자 정보 조회 네트워크 포함"으로 여유 있게 설정되어 있어 동일 3초 기준을 유지한다(변경 없음, 카카오·구글과 동일 NFR 적용).
- **Q16 (보안/법규 요구사항)**:
  - `client_secret` 은 어떤 코드 경로로도 Flutter 앱에 전달·저장되지 않는다(불변조건 — Flutter 는 code 획득까지만 담당, 교환은 반드시 백엔드).
  - `state` 파라미터로 CSRF 방지(OAuth 표준 관행) — 위조 방지값 발급·검증 흐름 필요 여부는 Design 단계에서 구체화.
  - **[확정 — Q-D: A 채택]** Naver 를 `AUTO_LINK_PROVIDERS`(FR-005 자동연동 화이트리스트)에 재등록(재허용)한다. code-exchange 방식은 client_secret 없이 제3자가 code 를 교환할 수 없어 GAP-014-08/GAP-014-10 이 우려한 "타 앱 발급 토큰 재전송" 전제가 소거되었기 때문이다. 6단계 Security Agent 최종 재감사 대상으로 spec.md 에 명시한다.

### [카테고리 6] 운영 환경

- **Q17 (실행 환경)**: 기존과 동일 — Fly.io backend app, 아웃바운드 HTTPS. 신규 아웃바운드 대상 1건(`nid.naver.com`) 추가, 기존 `openapi.naver.com` 재사용.
- **Q18 (예상 사용자 수·데이터 규모)**: 기존과 동일(변경 없음).
- **Q19 (배포·운영 담당)**: 기존과 동일 — Fly secrets 로 크레덴셜 주입.
- **PROC-009 배포 환경 cross-reference 결과**: `infra.md` §5(연결 실패 재시도 동작)·§8(알려진 인프라 제약) 확인 결과, 카카오(`kapi.kakao.com`)·구글(`oauth2.googleapis.com`) 아웃바운드는 등재되어 있으나 **네이버(`openapi.naver.com`) 는 014 당시 미활성이었던 관계로 등재되지 않았고, 신규 토큰 엔드포인트(`nid.naver.com`) 도 당연히 미등재** 상태다. → `infra.md` §5·§7·§8 갱신이 본 spec 완료 후 필요(Docs/Retrospective 단계 위임, 014 GAP-014-06 과 동일 패턴 — [NEEDS CLARIFICATION] 대상 아님, 신규 GAP 로 추적 예정). Fly.io 아웃바운드 트래픽 제한 없음(014 plan.md 확인 사실 재확인) — NAT/docker-proxy/L4 LB 흡수 이슈 해당 없음.
- **[확정 — Q-C: A 채택]** redirect URI/딥링크 구성 방식은 시스템 브라우저 + 커스텀 URL 스킴 리다이렉트로 확정. 인앱 WebView 는 금지한다. 정확한 스킴 문자열·Flutter 패키지는 Design 단계 `[TO-VERIFY]`로 위임한다(ASM-001).

### [카테고리 7] 예외 & 실패 시나리오

- **Q20 (시스템 실패 시 동작)**:
  - code-exchange 실패(무효/만료/재사용된 code, `redirect_uri` 불일치, `client_secret` 오류) → 401/400.
  - `NAVER_CLIENT_SECRET`/`NAVER_CLIENT_ID` 미설정 시 — 카카오/구글과 동일하게 `verify()` 호출 시점에 지연 조회(`getOrThrow`)하여 fail-closed(앱 전체 기동에는 영향 없음, GAP-014-04 패턴 계승).
  - 사용자가 네이버 인증 화면에서 취소(브라우저/웹뷰 닫기) → 기존 FR-014 패턴과 동일하게 로그인 화면으로 조용히 복귀, 오류 메시지 미표시.
- **Q21 (예상 오류·엣지 케이스)**: `state` 불일치(CSRF 의심) 시 거부. authorization code 재사용 시도 시 네이버 서버가 거부 응답 → 401 로 매핑. 네트워크 중단으로 code-exchange 요청이 타임아웃되는 경우 → 기존 소셜 로그인 실패 처리(FR-015 패턴)와 동일하게 오류 메시지 표시 + 이메일 로그인 안내.
- **Q22 (백업/복구)**: 해당 없음(014 와 동일 — 토큰·프로필 데이터는 저장하지 않으므로 백업 대상 아님).

---

## 기존 working tree 수정 통합

`_ai-workspace/runs/run-001-spec-agent.md` §A-0 참조. git 명령 실행 도구 부재로 자동 확인은 수행하지 못했으나, 대화 시작 시점 git status 스냅샷 확인 결과 수정 중인 파일 전부가 014-social-login 산출물(완료된 선행 작업)이며 본 015 신규 작업과의 충돌은 발견되지 않았다. 통합 대상 없음.

## 선행 spec 영향 추적 (Predecessor Lineage)

| 선행 spec | 식별된 결함 항목 | 결함 인지 시점 | 식별 경로 |
|---|---|---|---|
| v1.1.0/014-social-login | SEC-001(High) — Naver 공개 API 에 access token 의 app/client 바인딩 검증 수단 부재로, 제3자 앱 발급 토큰 재전송 시 계정 탈취 가능(path 3a/3b/3c). 최종적으로 Naver 를 활성 provider 집합에서 완전 제외하여 RESOLVED 처리 | 2026-07-02 (Security Agent v1.1~v1.3 재감사) | `security/security-report.md` SEC-001, `gaps.md` GAP-014-07/08/10 직접 확인 |
| v1.1.0/014-social-login | GAP-014-08 §완화 대안 1 — authorization code + client_secret 교환 방식으로 전환 시 근본 해소 가능하나 미채택(별도 spec 필요로 이월) | 2026-07-02 | `gaps.md` GAP-014-08 "완화 대안" 절 직접 확인 |

## 보완 내용

코디네이터 경유 확정 답변(Q-A~Q-D) 반영 결과:

- **범위**: Naver 소셜 로그인만 code-exchange 방식으로 재도입. 카카오·구글은 무변경(client-token 방식 유지).
- **client_secret**: 환경변수(`NAVER_CLIENT_SECRET`, 기존 `.env.example` placeholder 재사용)로 관리, verify/exchange 호출 시점 지연 조회로 fail-closed. 실 값 발급은 운영 셋업 단계, 파이프라인 검증은 stub/mock.
- **모바일 code 획득**: 시스템 브라우저 + 커스텀 URL 스킴 리다이렉트. 인앱 WebView 금지. 정확한 패키지·스킴 값은 Design `[TO-VERIFY]`.
- **자동연동**: Naver 를 `AUTO_LINK_PROVIDERS` 에 재편입(카카오·구글과 동일 적용). code-exchange 앱 바인딩 근거를 NFR 로 명시하고, 6단계 Security Agent 최종 재감사 대상으로 spec.md 에 고정.
- **선행 인프라 재사용**: `SocialProviderPort`·`SocialProviderResolver`·`social_accounts`·`SocialAuthService` 계정해석 3단계는 변경 없이 재사용. `naver.provider.ts`(014 미와이어 상태 보존)를 code-exchange 스타일로 재작성. `SocialLoginDto`(`@IsIn`)·`AuthModule`·Flutter `_SocialRow`/`SocialAuthService` 에 naver 재편입.
- **DB 스키마 변경 없음**: `social_accounts.provider` 는 이미 문자열 컬럼으로 'naver' 값을 수용 가능 — 신규 마이그레이션 불요.

전 카테고리 완료. [NEEDS CLARIFICATION] 0건. `spec/spec.md` 작성 완료.
