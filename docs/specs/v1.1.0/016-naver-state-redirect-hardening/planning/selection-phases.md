---
작성: Planning Agent
버전: v1.0
최종 수정: 2026-07-03 [시각 미확인 — Bash 도구 미제공으로 date 명령 실행 불가]
상태: 확정
---

# selection-phases.md

## 목차

- [선택 단계 활성화 결정](#선택-단계-활성화-결정)
- [신규 PyPI/패키지 의존성 자가 점검 (PATCH-A15)](#신규-pypi패키지-의존성-자가-점검-patch-a15)
- [활성화된 단계 실행 순서](#활성화된-단계-실행-순서)

---

## 선택 단계 활성화 결정

선택 단계 활성화 결정:

- **Database Design Agent: Y** — 근거: FR-002/FR-005(state TTL·1회성 소비) 저장을 위해 신규 `oauth_states` 테이블(`users` 스키마) + Prisma 마이그레이션 1건(`add_oauth_states`)이 발생한다(plan ADR-001, [데이터 모델]). DB 스키마 생성이 명시적으로 존재하므로 활성. 마이그레이션 SQL·인덱스(`@@index([expiresAt])`)·스키마 배치(P-001 users 스키마) 검증 대상. (in-memory 대안 채택 시 N 이었으나 ADR-001 로 PostgreSQL 채택.)

- **Deploy Agent: N** — 근거: Dockerfile·docker-compose·컨테이너 구조·CI/CD 변경 없음. 신규 npm 의존성 추가 0건(state 발급은 `node:crypto` native, 저장은 기존 Prisma/PostgreSQL — SC-012). `NAVER_REDIRECT_URI` 는 `.env.example` 문서화 + 운영 `fly secrets` 주입(기존 `NAVER_CLIENT_*` 동일 패턴, 배포 레이어)이며 인프라 구조 변경이 아니다. `[env:e2e-docker]` 태그 SC(SC-009)는 deferred(옵션 B, 실 크레덴셜 필요·범위 외)로 in-pipeline 검증 대상 아님.

- **Security Agent: Y (필수)** — 근거: 본 spec 목적 자체가 SEC-015-02(state CSRF 서버측 미검증, Medium)·SEC-015-03(redirect_uri 미확정, Low)의 하드닝이며, SC-014(NFR-006)·SC-015(NFR-007)가 **6단계 Security Agent 재감사에서 RESOLVED 판정**을 성공 기준으로 명시한다. 인증·CSRF·익명 엔드포인트(state 발급) 신설이 보안 요구사항으로 명시되어 있어 반드시 활성.

- **Performance Agent: N** — 근거: NFR-001(P95 3초)은 015 승계 기준으로 constitution 에 P95 수치 조항 부재, spec 자체 기준이며 신규 성능 목표 **수치 신설 없음**. 유일한 성능 SC(SC-009)는 `[env:e2e-docker]` deferred(실 OAuth 크레덴셜·네이티브 연동 필요, 옵션 B, 범위 외). state 발급/검증은 인덱스 단일 쿼리로 in-pipeline 측정 대상 부재. (015 도 동일 논리로 Performance N.)

---

## 신규 PyPI/패키지 의존성 자가 점검 (PATCH-A15)

> 본 프로젝트는 Node.js/npm(pnpm) 생태계 — PyPI 무관. npm 의존성 기준으로 자가 점검한다.

- 본 spec 에 신규 npm 의존성 추가가 있는가? → **없음.** state 난수 발급은 Node 20 표준 `node:crypto`(무의존), 저장은 기존 Prisma/PostgreSQL, redirect_uri 는 기존 `@nestjs/config`. `package.json` dependencies 변경 0건(SC-012 static 검증 대상).
- 따라서 `[env:e2e-docker]` Docker import 검증 대상 아님 → Deploy Agent 정적 갈음도 불요.

---

## 활성화된 단계 실행 순서

1. **Database Design Agent** (3단계 후 / 4단계 전) — `oauth_states` 마이그레이션·스키마 검증 → PPG-1(Development + Test AUTHORING) 진입.
2. **Security Agent** (6단계 후 / 7단계 전) — SEC-015-02/03 하드닝 재감사(SC-014/015 판정). Deploy·Performance 비활성이므로 캐스케이딩 블로킹 무관, 6단계 후 단독 실행.

> Deploy Agent·Performance Agent 비활성 → 선택 단계는 Database Design Agent(전반부) + Security Agent(후반부) 2종만 실행.

결정 일시 및 결정자: 2026-07-03 [시각 미확인] · Planning Agent (spec.md FR/NFR 분석 + spec-input Q13/Q-A/Q-B + constitution P-003 근거)
