---
작성: Planning Agent
버전: v1.0
최종 수정: 2026-07-03 [시각 미확인]
상태: 확정
---

# selection-phases.md

## 목차

- [선택 단계 활성화 결정](#선택-단계-활성화-결정)
- [신규 PyPI 의존성 자가 점검 (PATCH-A15)](#신규-pypi-의존성-자가-점검-patch-a15)
- [활성화된 단계 실행 순서](#활성화된-단계-실행-순서)

---

## 선택 단계 활성화 결정

선택 단계는 spec.md 의 FR/NFR 에 **명시적 요구사항이 존재할 때만** 활성화한다(암묵적 연관 금지).

- **Database Design Agent: N**
  - 근거: DB 스키마 변경·생성이 spec 에 명시되지 않음. `social_accounts.provider` 는 이미 문자열 컬럼으로 신규 값 'naver' 를 수용하며(014 마이그레이션 `20260701064209_add_social_accounts` 재사용), spec 배경·FR·범위 외 모두 "DB 스키마 변경 없음"을 명시(spec.md 선행 인프라 재사용 절, plan.md 데이터 모델). 신규 마이그레이션 0건.

- **Deploy Agent: N**
  - 근거: FR/NFR 에 배포 환경 구성·컨테이너화·CI/CD 변경이 명시되지 않음. 백엔드는 Node 20 native `fetch` 사용으로 **신규 npm 의존 0건**, Dockerfile/docker-compose/CI 구조 변경 없음. 크레덴셜은 기존 `fly secrets` 패턴(KAKAO_APP_ID·GOOGLE_CLIENT_ID 동일)으로 주입. `[env:e2e-docker]` 태그 SC 는 SC-016(성능) 1건이나 spec 이 명시적으로 deferred(옵션 B, 범위 외) → Docker 빌드 검증 대상 아님. infra.md §5/§7/§8 갱신(네이버 아웃바운드)은 문서 갱신으로 GAP-015-01(Docs/Retrospective 위임)이며 Deploy 검증 대상 아님.

- **Security Agent: Y (활성 — 필수)**
  - 근거: FR-006 네이버 자동연동 재허용 + FR-002 code-exchange 흐름은 spec NFR-003·SC-018 에서 **"6단계 Security Agent 의 최종 재감사로 확인해야 하는 필수 검토 대상"** 으로 명시적으로 지정됨. 소셜 인증(신규 인증 진입점)·계정 자동연동(계정 탈취 표면)·client_secret 크레덴셜 처리 = 인증/보안 요구사항 명시. 014 SEC-001(High) 이력의 근본 해소 여부를 code-exchange 앱바인딩 기준으로 재판정해야 하므로 활성 필수.
  - 감사 위임 포인트(plan.md 인가 3축 절): (1) code-exchange 앱바인딩의 redirect_uri 검증·code 1회성 의존, (2) state CSRF 발급·검증 완결성, (3) 네이버 자동연동 재허용의 계정 탈취 잔존 위험(email verified 플래그 부재 포함), (4) 네이버 access_token 비노출·비저장(SC-004)·client_secret 비노출(SC-017) 준수.

- **Performance Agent: N**
  - 근거: NFR-001(P95 3초) 성능 수치는 존재하나, 측정 SC-016 이 `[env:e2e-docker]` 실 OAuth 크레덴셜 필요로 spec 이 명시적으로 deferred(옵션 B, 범위 외) 처리. 파이프라인 내 모든 제공자 호출은 stub/mock 으로 in-pipeline 성능 측정 대상이 없음. 014 SC-019 와 동일 처리(014 에서도 Performance Agent 비활성). 실 측정은 운영 셋업 단계 수행.

---

## 신규 PyPI 의존성 자가 점검 (PATCH-A15)

- 본 spec 에 신규 PyPI 의존성 추가 있는가? → **없음 (본 항목 무관)**.
  - 본 프로젝트는 Node.js/TypeScript(백엔드) + Flutter/Dart(모바일) 스택이며 Python 미사용. 백엔드는 신규 npm 의존 0건(native fetch), 모바일은 Flutter 딥링크 패키지 신규 도입 가능성(ASM-001, Design 확정)이나 이는 pub.dev 패키지이며 Docker 빌드 대상(백엔드) 무관. `[env:e2e-docker]` SC(SC-016)는 deferred.

---

## 활성화된 단계 실행 순서

Security Agent (단독 — Deploy/Performance 비활성)

- 실행 위치: 6단계 Docs 후 / 7단계 Retrospective 전.
- 캐스케이딩: Deploy 비활성이므로 블로킹 없음. Security Agent status: COMPLETE(Medium 이하) 시에도 Performance 비활성으로 후속 없음. Security BLOCKED(Critical/High) 시 코드 수정 후 재검증.

결정 일시: 2026-07-03 [시각 미확인]
결정자: Planning Agent (015-naver-code-exchange)
</content>
