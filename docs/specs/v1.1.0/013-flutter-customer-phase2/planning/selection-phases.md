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

---

## 선택 단계 활성화 결정

- **Database Design Agent**: **N**
  - 근거: spec FR/NFR 에 DB 스키마 변경이 **명시되지 않음**(spec 은 WHAT 수준). 신규 테이블 `password_reset_otps` 는 Planning HOW 결정으로 plan.md §데이터 모델에 Prisma 모델·인덱스·마이그레이션 영향까지 완전 명세됨. 단일·단순 테이블(관계·파티션·복합 인덱스 설계 불요)로 전용 Agent 활성 실익 없음. Design/Development 가 plan 명세대로 모델+마이그레이션 구현. (암묵적 연관 활성화 금지 원칙 준수)

- **Deploy Agent**: **N**
  - 근거: spec FR/NFR 에 배포 환경 구성·컨테이너화·CI/CD 변경 **명시 없음**. 신규 npm 의존성(`nodemailer`)·신규 환경변수(SMTP_*·MAIL_FROM) 추가가 있으나 Dockerfile/docker-compose/CI 구조 변경 없이 기존 Fly.io backend app 에 추가됨. `[env:e2e-docker]` 태그 SC **부재**(SC 환경 태그는 static/unit/integration 만). 신규 의존성은 Test Agent 단위/e2e(StubMailer) 정적·통합 검증으로 갈음. **신규 환경변수·secret 목록·infra.md §7/§8 갱신은 Docs/Retrospective 단계 위임.**

- **Security Agent**: **Y**
  - 근거: spec NFR/FR 에 보안·개인정보 요구사항 **명시**됨 — NFR-002(OTP 만료)·NFR-003(rate-limit)·NFR-004(이메일 마스킹 PII)·FR-011/012(OTP 비밀번호 재설정=인증 복구)·FR-015/016(전화번호→마스킹 이메일). 추가로 GAP-013-02(user enumeration / PII 노출 trade-off — forgot-password 404·find-email)·ADR-005(OTP 해시 저장)·ADR-006 의 완화 설계 검토를 Security Agent 에 위임. 민감 데이터(OTP·비밀번호·전화번호·이메일) 다수 취급.

- **Performance Agent**: **N**
  - 근거: 유일한 수치 성능 목표 NFR-001(GET /categories 화면 표시 P95 3초)은 단순 read 엔드포인트로 충족이 자명하며(기존 CategoriesController 답습, 별도 최적화 설계 대상 없음) SC-025(`[env:integration]`)로 검증 경로 존재. 3초 budget 은 매우 관대하여 전용 성능 엔지니어링 실익 없음. 프로젝트 선례(003-commerce P95 SC 운영 시드 후 측정·infra §4 모니터링)와 동일하게 운영 모니터링으로 사후 측정. *(literal 수치-목표 트리거 대비 판단 deviation — 위 근거로 정당화)*

---

## 신규 PyPI/패키지 의존성 자가 점검 (PATCH-A15)

> 본 spec 은 Python/PyPI 아님(Node/TS 백엔드 + Flutter/Dart). PyPI 원칙을 npm/pub 생태계에 동일 적용.

- 신규 npm 의존성: `nodemailer`(+`@types/nodemailer` dev) — 백엔드 SMTP 발송.
  - `[env:e2e-docker]` 태그 SC **부재** → Deploy Agent 비활성 가능. 본 의존성은 e2e-docker 검증 대상 아님(StubMailer 로 통합 검증). **신규 의존성 추가만, e2e-docker 검증 대상 아님.**
- 신규 pub(Flutter) 의존성: `url_launcher`·`shared_preferences` — Docker 빌드 무관(스토어 빌드). e2e-docker 무관.
- 결론: Deploy Agent 활성화 불요. Test Agent 가 단위/e2e(StubMailer) + `flutter analyze`(SC-026) 정적 검증으로 의존성 동작 갈음.

---

## 활성화된 단계 실행 순서

활성 선택 Agent: **Security Agent** (1종).

실행 위치: 6단계 Docs 후 / 7단계 Retrospective 전.
- Deploy Agent 비활성 → 캐스케이딩 블로킹 무관, Security Agent 독립 실행.
- Performance Agent 비활성.

결정 일시: 2026-07-01 [시각 미확인] (Bash 미제공 — agent-rules §10)
결정자: Planning Agent (013-flutter-customer-phase2 2단계)
</content>
