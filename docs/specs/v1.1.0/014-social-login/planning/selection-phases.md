---
작성: Planning Agent
버전: v1.0
최종 수정: 2026-07-01
상태: 확정
---

# selection-phases.md

## 목차

- [선택 단계 활성화 결정](#선택-단계-활성화-결정)
- [신규 PyPI/패키지 의존성 자가 점검 (PATCH-A15)](#신규-pypi패키지-의존성-자가-점검-patch-a15)
- [활성화된 단계 실행 순서](#활성화된-단계-실행-순서)

## 선택 단계 활성화 결정

| Agent | 결정 | 근거 |
|---|---|---|
| Database Design Agent | **Y** | FR-009 가 신규 `social_accounts` 테이블(users 스키마, users 와 1:N, provider·providerId·email·name, `@@unique([provider,providerId])`) 생성을 **명시**. User.password nullable 전환(ADR-005) + relation 추가 동반. DB 스키마 변경·생성 명시 조건 충족 |
| Deploy Agent | **N** | 배포 환경 구성·컨테이너화·CI/CD **구조 변경 없음**. NFR-004 는 env 변수 추가(`.env.example` + fly secrets)로 한정되며 Dockerfile/docker-compose/ci.yml 변경 없음. 신규 npm 의존은 백엔드 native fetch 채택으로 0건(google-auth-library 채택 시에도 Docker 빌드 구조 무변경, 정적 갈음 대상). Flutter SDK 는 pub.dev 의존(Docker 무관) |
| Security Agent | **Y** | spec 전체가 **인증**(소셜 로그인) 요구. FR-002 토큰 검증, FR-005 자동 연동(ASM-001 제공자 이메일 신뢰 = 계정 탈취 벡터), NFR-002 이메일 소유권 신뢰 전제 등 보안 민감 결정 다수 명시. 자동 연동 이메일 신뢰 모델·google `aud` 대조·providerId 우선 매칭 회귀 방어를 감사 필요 |
| Performance Agent | **N** | NFR-001 에 P95 3초 수치가 명시되나, 측정 SC-019 는 실 OAuth 크레덴셜 필요로 spec 이 **명시적 deferred(범위 외)** 처리. 파이프라인 내 모든 제공자 호출은 mock 이므로 in-pipeline 측정 대상이 존재하지 않음. 실 측정은 운영 셋업(옵션 B)에서 수행. 활성화해도 검증 대상 부재 |

## 신규 PyPI/패키지 의존성 자가 점검 (PATCH-A15)

> 본 프로젝트는 TypeScript(NestJS)/Flutter 스택. PyPI 무관하므로 npm·pub 의존 기준으로 점검.

- **백엔드 npm**: 신규 의존 **0건**(Node 20 native fetch 채택). google-auth-library 채택 여부는 Design 미확정([TO-VERIFY], ADR-002). 채택 시에도 `[env:e2e-docker]` 태그 SC 는 SC-019(deferred·범위 외) 뿐 → Deploy 정적 갈음 대상, Deploy Agent 활성 불요. 근거: **신규 의존 잠재 1건이나 e2e-docker 검증 대상 아님(SC-019 deferred), Dockerfile 미변경**.
- **Flutter pub**: 소셜 SDK 3종 신규(`[TO-VERIFY]` 패키지명). pub.dev 의존이며 Docker 빌드 무관(Flutter 앱은 컨테이너화 대상 아님). Deploy Agent 무관.
- **결론**: 신규 패키지 의존이 e2e-docker 검증 대상 SC 를 발생시키지 않음 → Deploy Agent N 유지.

## 활성화된 단계 실행 순서

1. **Database Design Agent** — 3단계(Design) 후 / 4단계(Development) 전. `social_accounts` 스키마·마이그레이션·User relation·password nullable 확정.
2. **Security Agent** — 6단계(Docs) 후 / 7단계(Retrospective) 전. 자동 연동 이메일 신뢰 모델·토큰 검증 감사.

> 캐스케이딩: Deploy Agent 비활성이므로 Security Agent 독립 실행. Performance Agent 비활성. Security 가 Critical/High 블로킹 아니면 Retrospective 진행.

결정 일시: 2026-07-01 [시각 미확인]
결정자: Planning Agent (main session 최종 승인 대기)
