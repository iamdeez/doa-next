---
작성: Retrospective Agent
버전: v1.0
최종 수정: 2026-07-02 [시각 미확인]
상태: 적용 완료 (2026-07-02, 전역→~/.claude/docs-change-logs/2026-07-02-001.md · 프로젝트→.claude/docs-change-logs/2026-07-02-001.md · spec.md 정합화 완료 · memory naver-social-login-excluded 등재)
---

# Context / Infra 갱신 패치: 014-social-login

> 본 Agent 는 context.md / infra.md / spec.md 를 직접 수정하지 않는다. 아래 PATCH-CXT 후보를 main session 이 사용자 승인 후 적용한다.
> 모든 context/infra 패치는 additive(기존 정의 부정합 아님). PROC-002 코드 검증 완료.

## 목차

- [PATCH-CXT-014-01 — context.md (auth 소셜 로그인·social/ 모듈·social_accounts·User.password nullable)](#patch-cxt-014-01)
- [PATCH-CXT-014-02 — infra.md (OAuth 크레덴셜·아웃바운드 provider 2종)](#patch-cxt-014-02)
- [PATCH-CXT-014-03 — context.md §6 (SEC-002 orphan user Medium 부채)](#patch-cxt-014-03)
- [PATCH-CXT-014-04 — spec.md naver 지원 서술 정합화 (GAP-014-09)](#patch-cxt-014-04)

---

## PATCH-CXT-014-01

- **대상 파일**: `/Users/krystal/workspace/doa/doa-next/.claude/docs/context.md`
- **대상 섹션**: §2 핵심 도메인 모듈 목록(auth 행) + §2 공통·인프라 모듈 / §4 데이터 모델
- **변경 내용**:
  1. **§2 핵심 도메인 모듈** `auth` 행 역할에 소셜 로그인 위임 추가:
     - 현재(L75): `로그인/JWT/Refresh/비밀번호 재설정 OTP(...)·이메일 찾기(...)/세션`
     - 변경: 말미에 `· 소셜 로그인(POST /auth/social-login — 카카오·구글, SocialAuthService 계정해석 3단계: providerId 매칭 재로그인→email 매칭 자동연동→신규가입)` 추가.
  2. **§2 공통·인프라 모듈** 표(또는 auth 하위 서브 항목)에 소셜 provider 계층 행 추가:
     - `| social/ (auth 내부) | src/modules/auth/social/ | SocialProviderPort 추상 + KakaoProvider(access_token_info app_id 대조)·GoogleProvider(tokeninfo aud+email_verified)·StubSocialProvider(테스트). SocialProviderResolver 가 provider 문자열→구현체 매핑(kakao·google 활성). NaverProvider 는 파일 보존·미와이어(SEC-001/GAP-014-08/10) |`
  3. **§4 데이터 모델** `users` 스키마 테이블 목록에 `social_accounts` 추가:
     - 스키마 분리 구조 블록(L182 `users` 행)에 `social_accounts` 추가. 서술 문단에 "`users.social_accounts`(014): 소셜 계정 연동 — provider·providerId·userId·createdAt, `@@unique([provider, providerId])`·`@@index([userId])`·FK onDelete Cascade·`@@schema("users")`" 추가.
     - `users.users.password: String → String?` 전환(ADR-005) 반영 — 소셜 전용 사용자(비밀번호 없음) 허용, 이메일+비밀번호 로그인 시 null 가드(NFR-003). §4 도메인 모델 절 또는 주요 설계 결정에 명시.
     - §4 머리말 "31개 테이블" → "32개 테이블" 표기 검토(social_accounts 신규, 마이그레이션 `20260701064209_add_social_accounts`).
- **변경 근거**: GAP-014-05 (문서-갱신-필요, additive). 후속 spec 설계 시 auth 소셜 구조·social_accounts 스키마 재분석 중복 방지.
- **코드 검증** (PROC-002):
  - `apps/backend/prisma/schema.prisma` L22 `password String?`·L39 `model SocialAccount`·L50 `@@unique([provider, providerId])` 확인.
  - `apps/backend/src/modules/auth/social/` — social-provider.port.ts·kakao/google/naver.provider.ts·stub-social.provider.ts·social-provider.resolver.ts 확인.
  - `social-provider.resolver.ts` L18-25 — constructor 주입·providers 매핑이 kakao·google 2개뿐(naver 미포함) 확인.
  - `apps/backend/prisma/migrations/20260701064209_add_social_accounts/` 존재 확인.
  - 일치 여부: 갱신 텍스트가 코드 사실과 일치.
- **참고 (검토중 — 사용자 확인 권고)**: §4·§1 의 총 테이블 수 표기(현행 "31테이블")는 social_accounts 추가 후 재확인 필요. 코드상 신규 1테이블은 확정이나 개요 수치 전면 갱신은 §1·§4 문맥 정합을 사용자가 확인 후 반영 권고.

---

## PATCH-CXT-014-02

- **대상 파일**: `/Users/krystal/workspace/doa/doa-next/.claude/docs/infra.md`
- **대상 섹션**: §5 연결 실패 재시도 동작 / §7 배포 전 확인 체크리스트 / §8 알려진 인프라 제약
- **변경 내용**:
  1. **§7 배포 전 확인 체크리스트** 추가:
     - `[ ] OAuth 소셜 로그인 크레덴셜 Fly secret 설정 확인 (KAKAO_APP_ID·KAKAO_REST_API_KEY·GOOGLE_CLIENT_ID). 미설정 시 verify() 호출 시점 500(fail-closed, 앱 기동에는 무영향 — GAP-014-04 패턴). 활성 provider: 카카오·구글 2종 (014-social-login)`
  2. **§5 연결 실패 재시도 동작** 행 추가(신규 아웃바운드 의존):
     - `| 카카오 API (kapi.kakao.com) | native fetch, 재시도 없음 | 검증 실패 시 4xx/5xx 반환 (POST /auth/social-login) |`
     - `| 구글 tokeninfo (oauth2.googleapis.com) | native fetch, 재시도 없음 | 검증 실패 시 4xx/5xx 반환 |`
  3. **§8 알려진 인프라 제약** 행 추가:
     - `| 소셜 로그인 아웃바운드 의존성 | POST /auth/social-login 은 요청마다 kapi.kakao.com·oauth2.googleapis.com 로 아웃바운드 HTTP 호출(토큰 검증). 익명 엔드포인트·rate limit 부재(SEC-004, Low) → 무효 토큰 대량 전송 시 아웃바운드 증폭 표면. 완화: @nestjs/throttler 검토(별도 과제) | auth 모듈·운영 | 014-social-login |`
- **변경 근거**: GAP-014-06 (문서-갱신-필요). **Naver(openapi.naver.com)는 이번 릴리즈 완전 제외되어 아웃바운드 의존에서 배제** — GAP-014-06 원문의 3종(kakao·google·naver)에서 2종(kakao·google)으로 축소 반영.
- **코드 검증** (PROC-002):
  - `apps/backend/.env.example` L23 `KAKAO_REST_API_KEY`·L26 `KAKAO_APP_ID`·L28 `GOOGLE_CLIENT_ID` 확인. (L30 `NAVER_CLIENT_ID`·L32 `NAVER_CLIENT_SECRET` 은 파일에 잔존하나 코드 미사용 — naver 미와이어, GAP-014-09 문서 정합성 이슈로 별도 분류. 체크리스트에는 활성 2종만 등재.)
  - `social-provider.resolver.ts` L18-25 — 활성 provider kakao·google 2개 확인.
  - `kakao.provider.ts`·`google.provider.ts` — 아웃바운드 대상 엔드포인트(kapi.kakao.com·oauth2.googleapis.com) native fetch 호출 확인(security-report.md v1.3 검토 대조).
  - 일치 여부: 갱신 텍스트가 코드 사실과 일치(활성 2 provider 기준).

---

## PATCH-CXT-014-03

- **대상 파일**: `/Users/krystal/workspace/doa/doa-next/.claude/docs/context.md`
- **대상 섹션**: §6 알려진 제약 및 기술 부채
- **변경 내용**: 아래 Medium 보안 부채 행 추가(PROC-013-03 — Security Medium 위임을 프로젝트 문서 등재하여 무추적 소실 방지, 다음 spec 설계 워크플로우 ③ 노출):
  - `| 소셜 신규가입 경로 orphan user 위험 (SEC-002/GAP-014-01) | SocialAuthService.login() path 3c(신규가입)는 createUser+createSocialAccount 두 INSERT 가 runInTransaction 으로 원자화되지 않음(root fallback). 두 번째 쓰기 실패 시 password:null orphan user 가 email 슬롯 점유(Medium — 계정탈취·권한상승 무관, P2002 폴백으로 대부분 자연 복구). 개선: path 3c 를 runInTransaction 래핑(tasks.md T-B4 원설계 의도) | auth 모듈 | 014-social-login (후속 위임) |`
- **변경 근거**: GAP-014-01·SEC-002 (Security Agent Medium 위임). security-report.md v1.3 권고 4(PROC-013-03) 가 명시적으로 context §6 등재 권고. 013 의 auth tx 부채 계열(SEC-003 revoke 비원자)과 동일 근본원인(ALS tx-aware 미wrapping) 누적.
- **코드 검증** (PROC-002): `apps/backend/src/modules/auth/social-auth.service.ts` path 3c 가 `runInTransaction` 로 감싸지지 않음(security-report.md v1.3 SEC-002 코드 grep 재확인 근거). `apps/backend/src/shared/prisma/prisma.service.ts` `tx` getter root fallback 확인(GAP-014-01 안전망). 본 항목은 "미해결 부채 기록"이므로 현행 미적용 상태와 일치.
- **비고**: 프로젝트 특정 보안 사안(범용성 미충족) → 전역 규칙 아닌 context.md §6 이 적합. 후속 patch spec 신설/기존 spec 편입 결정은 main session·사용자 위임.

---

## PATCH-CXT-014-04

- **대상 파일**: `docs/specs/v1.1.0/014-social-login/spec/spec.md` (프로젝트 산출물 — Spec Agent 소유, Retrospective 직접 미수정)
- **대상 섹션**: FR-001 / NFR-004 / SC-009 / SC-013 / SC-018 / 범위 외
- **변경 내용**: agent-patches.md PATCH-014-03 과 동일 — spec.md 의 naver 지원 서술을 "이번 릴리즈 제외(SEC-001/GAP-014-08/GAP-014-10)"로 정합화. 상세는 PATCH-014-03 참조.
- **변경 근거**: GAP-014-09 (미해결, 범위 확대). 구현이 naver 완전 제외로 축소되었으나 spec.md 다수 문구가 naver 지원을 서술 → spec.md 가 SoT 로서 신뢰 불가. 다음 spec 설계자의 naver 지원 오인 위험.
- **처리 경로**: Retrospective 는 spec.md 를 직접 수정하지 않는다([MUST NOT] 단일 책임). main session 이 `spec 수정` 이벤트로 Spec Agent 재호출 또는 사용자 승인 후 처리. 갱신 전까지 코드(구현)가 우선하며 spec.md 는 신뢰할 수 없는 상태임을 인지.
- **코드 검증** (PROC-002): `social-provider.resolver.ts`(kakao·google 만 매핑)·`dto/social-login.dto.ts` L6 `SUPPORTED_PROVIDERS = ['kakao','google']`·L10 `@IsIn` 로 naver 가 API 경계에서 거부됨을 확인 — 구현이 naver 제외 상태이나 spec.md 는 naver 서술 잔존(불일치 확정).
</content>
