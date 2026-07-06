---
작성: Test Agent (EXECUTION)
버전: v1.3
최종 수정: 2026-07-02 20:14
상태: 확정
---

# Coverage Gap: 014-social-login

## 목차

- [4-카테고리 분류](#4-카테고리-분류)
- [처리 방침](#처리-방침)

---

## 4-카테고리 분류

| SC-ID | 미커버 시나리오 | 카테고리 | 검증 방법 | 환경/도구 | 담당 (개발/운영/QA) | 비고 |
|---|---|---|---|---|---|---|
| SC-019 | 소셜 로그인 백엔드 API P95 응답 3초 이내(NFR-001) — 실 OAuth 제공자 크레덴셜·네트워크 필요 | (2) 단위테스트 불가 | 실 크레덴셜 발급 후 운영 환경에서 P95 측정 (`ab`/`k6` 등) | `[env:e2e-docker]`, 실 카카오·구글·네이버 크레덴셜 | 운영 | spec.md Out of Scope §"실 제공자 네트워크 호출 E2E 테스트" 명시. spec PROC-014 사후 운영 검증 절차 §5(자동 연동 확인)에 포함 |
| GAP-014-01 (SC-003 경로 원자성) | `createUser`+`createSocialAccount` 트랜잭션 원자성의 실경로(롤백·orphan user 방지) — `AuthRepository` 전체 mock 으로는 tx/root 분기 미표면화 | (3) 운영 환경에서 확인 권장 | 실 DB 기반 통합 테스트(testcontainers 등) 또는 운영 환경에서 소셜 신규가입 다발 상황 모니터링(orphan user 발생 여부) | 실 PostgreSQL, `PrismaService` 실 트랜잭션 | 개발/운영 | 안전망: `users.email @unique` + `social_accounts @@unique([provider,providerId])` + P2002 catch 재해석 폴백(설계 단계 확인). GAP-014-01(design) 원문 참조 |
| SC-017 (`flutter analyze` 명령 자체) | `flutter analyze` 명령 자체는 `dart:test` 내에서 실행 불가(도구적 한계) | (2) 단위테스트 불가 | CI 파이프라인에서 `flutter analyze lib/` 별도 step 실행 | CI | 개발/QA | 본 5b 단계에서 `flutter analyze lib/` 를 직접 실행하여 SC-017 자체는 PASS 확인(coverage.md 참조). 여기 기록된 한계는 "dart:test 내부에서 재현 불가"라는 도구적 제약이며, CI 상시 실행으로 상시 검증 필요 |
| SC-011~016 실 네이티브 SDK 연동 | Flutter 앱의 실제 카카오/구글/네이버 SDK 초기화(Info.plist·AndroidManifest·deep link·앱 키) 및 실 기기 인증 흐름 — 단위 테스트는 `SocialAuthService` 인터페이스 mock 으로 SDK 무의존 검증(plan.md ASM-002) | (2) 단위테스트 불가 | 실 기기에서 3사 소셜 로그인 1회씩 수동 테스트 (spec PROC-014 §사후 운영 검증 1~3) | 실 기기(iOS/Android), 실 크레덴셜 | 사용자(옵션 B 채택, spec.md 명시) | plan.md ASM-002 — Flutter SDK 네이티브 설정은 운영 셋업 단계 deferred |
| GAP-014-08 (Naver 토큰 app 바인딩 잔여 위험) | `NaverProvider.verify()` 에 대응하는 app/client 바인딩(카카오 `access_token_info`·구글 `tokeninfo` 와 동등) 검증 — 네이버 오픈API가 해당 공개 엔드포인트를 제공하지 않아 코드로 구현 불가(SEC-001/GAP-014-08, 조사 완료). **v1.2 갱신**: 근본 해결(앱 바인딩 검증) 자체는 여전히 단위테스트로 검증 불가하나, 완화 조치(FR-005 path 3b naver 자동연동 비활성)는 `social-auth.service.autolink-policy.spec.ts` 로 단위 검증 가능하며 본 5b 에서 4/4 PASS 확인(카테고리 (1) 아님 — 이미 Development Agent 가 작성·PASS 완료, 미작성 항목 없음) | (2) 단위테스트 불가 (근본 원인 한정) | 완화 대안 채택 시 별도 spec: (1) `NAVER_CLIENT_SECRET` authorization code 교환 방식 전환(ADR-001 재검토) 또는 (2) FR-005 자동연동 경로 소유권 확인 단계 추가(NFR-002 변경). 미채택 시 위험 수용(risk acceptance)으로 처리 | 네이버 개발자센터 문서 재확인, 실 네이버 계정 | 사용자/main session (결정 대기) | 코드 로직 변경: `social-auth.service.ts` `AUTO_LINK_PROVIDERS` 화이트리스트로 naver path 3b 차단(완화 조치, 근본원인 미해소로 GAP 상태값 OPEN 유지). SC-XXX 매핑 없음(SEC-XXX 보안 감사 항목) |
| GAP-014-09 (spec.md FR-001/NFR-004/SC-009/SC-013/SC-018/범위 외 절 — naver 서술 잔존) | `spec.md` 가 여전히 naver 를 지원 provider 로 서술(FR-001 "카카오·구글·네이버 중 하나", NFR-004, SC-009, SC-013, SC-018, 범위 외 절 "카카오·구글·네이버 개발자 콘솔")하나, production 구현은 naver 를 API 경계(`SocialLoginDto` `@IsIn`)에서부터 완전히 거부한다(v1.3, SEC-001/GAP-014-10 최종 결정) | (4) 차후 점검 | main session/Spec Agent 가 spec.md 전면 검토: (1) FR-001/NFR-004 "카카오·구글(Naver 제외)" 갱신, (2) SC-009/SC-013 제거 또는 범위 외 이관, (3) SC-018 크레덴셜 항목의 NAVER_* 존치 여부 결정, (4) 범위 외 절에 naver 제외 사실 추가 | spec.md 편집 (Spec Agent 단일 책임) | main session/Spec Agent | v1.1(자동연동 비활성)~v1.2(완전 제외) 두 차례 완화 조치를 거치며 간극 범위가 "FR-005 provider 예외" 수준에서 "provider 지원 목록 자체"로 확대됨(Development Agent 기록). 갱신 전까지 spec.md 는 SoT 로서 신뢰할 수 없는 상태 — 코드(구현)가 우선. 이전 v1.2 에서 "참고 등재"였으나 SC-009/SC-013 테스트 자체가 제거된 v1.3 시점에는 실질적 SC 커버리지 갭(정식 미커버 항목)으로 승격 |
| SC-009 (`provider: 'naver'` 검증 흐름) | 사용자 최종 결정으로 Naver 소셜 로그인을 이번 릴리즈에서 완전 제외(SEC-001/GAP-014-10 — app-binding 검증 수단 부재로 path 3a 재로그인 경로의 기존 naver 연동 계정 완전 탈취 위험 근본 해소 불가). 5a 가 `test_SC009_naver_provider_verify_path_returns_jwt` 제거. 단위테스트 가능·불가 여부와 무관하게 기능 자체가 범위에서 제외됨 | (4) 차후 점검 | 별도 spec에서 (a) authorization code+client_secret 교환 방식(ADR-001 재검토) 채택 또는 (b) 위험 수용 결정 후 provider 재도입 시 SC-009 재작성 | — | 사용자/main session(재도입 결정 시) | `naver.provider.ts` 는 삭제되지 않고 미와이어 상태로 보존(재도입 시 골격 재사용 가능, docstring 갱신됨) |
| SC-013 (`LoginScreen` 네이버 버튼 핸들러) | 범위 외 — SC-009 와 동일 사유. `login_screen.dart` 의 `_SocialRow` 에서 네이버 버튼 자체가 production 에서 제거됨(Development Agent) | (4) 차후 점검 | 별도 spec에서 Naver 재도입 시 SC-013 재작성 | — | 사용자/main session(재도입 결정 시) | 5a 가 `test_SC013_naver_button_has_gesture_detector_and_handler` 제거 |
| SC-018 (naver 크레덴셜 항목, 부분) | `.env.example` 의 `NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET` 존재 검증이 5a 에 의해 테스트 범위에서 제외됨(범위 외 — Naver 이번 릴리즈 제외). kakao·google 항목은 계속 검증·PASS | (4) 차후 점검 | 별도 spec에서 Naver 재도입 시 NAVER_CLIENT_ID/SECRET 검증 재추가, 또는 미재도입 확정 시 `.env.example` 자체에서 두 항목 제거 결정(spec.md 갱신과 함께) | — | 사용자/main session | `.env.example` 파일 자체는 변경되지 않아(grep 확인) 두 항목이 여전히 존재하나 활성 provider 목록과 불일치 — 문서·env 파일 정합성 차원의 잔여 정리 필요 |

---

## 처리 방침

- 카테고리 (1) 항목: **0건**. 단위테스트 가능한 미작성 항목 없음 — Development Agent 복귀 불필요.
- 카테고리 (2)(3)(4) 만 존재 → 본 절차로 위임 종료. Docs Agent(6단계) 진행 가능.
- SC-019 는 5b 단계 판정 기준 "모든 SC-XXX 대응 테스트 존재" 항목을 deferred 처리로 충족한 것으로 간주(§SC 환경 태그 라우팅, `[env:e2e-docker]` → Deploy Agent 위임).
- **v1.1 추가(SEC-001 재검증)**: GAP-014-08(Naver 잔여 위험) 신규 등재 — 카테고리 (2), 공개 API 제약으로 코드 수정 자체가 불가능하여 단위테스트로도 검증 불가. 카테고리 (1) 은 여전히 0건이므로 처리 방침 변경 없음.
- **v1.2 추가(Naver 자동연동 비활성 재검증)**: GAP-014-08 을 완화 조치(자동연동 비활성) 적용 사실로 갱신 — 완화 조치 자체는 이미 회귀 테스트로 PASS 확인되어 카테고리 (1)(미작성 항목) 에 해당하지 않는다. 근본 원인(앱 바인딩 검증 수단 부재)만 여전히 카테고리 (2). GAP-014-09(spec.md 정합성 간극)를 참고 등재 — 테스트 커버리지 갭이 아니므로 처리 방침(카테고리 (1) 0건)에는 영향 없음.
- **v1.3 추가(Naver 완전 제외 최종 재검증)**: 사용자 최종 결정으로 Naver 를 활성 provider 에서 완전 제거. SC-009·SC-013 테스트가 제거되어 카테고리 (4) 로 신규 등재(단위테스트 기술적 불가가 아닌 사용자 보안 결정에 의한 스코프 제외). SC-018 은 kakao·google 부분만 PASS 유지, naver 부분은 (4) 등재. GAP-014-09 를 "참고" 에서 정식 (4) 항목으로 승격(spec.md 정합성 간극이 provider 지원 목록 자체로 확대). GAP-014-08/GAP-014-10 은 Development Agent 보고대로 RESOLVED 확인(근본 원인 미해소이나 리스크 경로 자체가 소거되어 더 이상 카테고리 (2) 항목으로 추적할 실익 없음 — 재도입 시에만 재부상). 카테고리 (1) 은 여전히 **0건** — Development Agent 복귀 불필요, Docs Agent(6단계) 진행 가능.
