---
작성: Planning Agent
버전: v1.0
최종 수정: 2026-07-06 14:10 (spawn 기준 — date 도구 미제공, §10/PROC-016-02)
상태: 확정
---

# selection-phases.md

> 활성화 원칙: spec.md 의 FR/NFR 에 **명시적 요구사항이 존재할 때만** 활성화. 암묵적 연관 금지.

## 목차

- [선택 단계 활성화 결정](#선택-단계-활성화-결정)
- [신규 의존성 자가 점검 (PATCH-A15)](#신규-의존성-자가-점검-patch-a15)
- [활성화된 단계 실행 순서](#활성화된-단계-실행-순서)
- [결정 일시 및 결정자](#결정-일시-및-결정자)

## 선택 단계 활성화 결정

- **Database Design Agent: N**
  - 근거: 본 spec 은 **DB 스키마 변경·생성이 없다**. `files.files`(key·url·status 컬럼)는 기존재(schema.prisma L768-784), 신규 DDL·인덱스·enum·테이블 0건. 020 이 DB Design 을 활성화한 사유(레거시 18서비스↔신규 33테이블 **필드 단위 비-1:1 매핑 명세**·변환 SQL)가 022 에는 부재 — 파일 이관은 **key identity 복사**(레거시 key = R2 key, FR-004)로 관계형 재구조화·필드 매핑이 없다. url 갱신은 단일 컬럼 결정적 UPDATE(`base||'/'||key`, ADR-005)이고 검증 카운트는 단순 `count(*)` 로, Design/Development 범위에서 작성 가능. 감사 테이블(`verification_runs`)은 020 산출물 재사용(신규 DDL 아님). 활성화 기준("FR/NFR 에 DB 스키마 변경·생성이 명시") 미충족 → **N**.

- **Deploy Agent: Y**
  - 근거: FR-010(020 전용 러너 이미지 `scripts/migration/Dockerfile` **재사용·확장** — `apk add rclone`, ADR-002)·SC-010(스크립트가 러너 이미지 내 실행 가능)이 명시적 컨테이너·배포 구성 활동. 파일 델타가 020 컷오버 60분 윈도우(NFR-001) 내에 통합 배치되어야 하므로 **컷오버 런북에 파일 이관 단계(precopy/delta/verify/url-update)를 통합**하는 작업이 필요(infra.md §8 "컷오버 실행 인프라(020)" 승계). Fly one-off machine 실행·R2 서빙 도메인 확인·레거시 egress 인지도 배포·운영 검토 대상. 실행 위치: 6단계 후/7단계 전(순서 1번).

- **Security Agent: Y**
  - 근거: NFR-004(전송 채널 TLS/HTTPS)·ADR-009(자격증명 취급·평문 로그 금지)·FR-001(PII 성격 파일 — 상품·리뷰·**프로필 이미지**)이 명시. 이관 러너가 **3중 자격증명**(레거시 S3 read + R2 write + 타깃 DB write)을 동시 취급하는 접근 통제 표면(020 ASM-010/011 동형)이 보안 감사 대상이다. 020 감사 부채 2건(SEC-020-01 스테이징 정리 미자동화·SEC-020-02 감사 행위자 미기록)이 `verification_runs` 재사용으로 상속되어 파일 이관 맥락 재평가 필요. 실행 위치: 6단계 후/7단계 전(순서 2번).

- **Performance Agent: Y**
  - 근거: NFR-001(델타 이관 ≤60분 — 020 윈도우 공유, **수치 목표**)·FR-009/SC-009(precheck 총개수·총용량·**예상소요** 산정)이 명시적 성능 산정 활동. 델타 구간 윈도우 예산 모델·rclone 처리량 산정·레거시 egress 대역폭 병목 식별이 성능 엔지니어링 영역. **한계 명시**: 실 처리량·객체 규모(ASM-004)는 사용자 환경 의존(옵션 A) — Performance Agent 는 예산 모델·사전평가 방법론·병목 식별을 담당하고 실측은 사용자 실행 결과로 보완. **참고**: 사전 대량복사는 NFR-002 로 시간 무제약이라 성능 리스크가 020 대비 낮으나(윈도우 밖), 델타 구간 수치 목표(NFR-001)+예상소요 산정(FR-009)이 명시되어 활성화. 실행 위치: 6단계 후/7단계 전(순서 3번).

## 신규 의존성 자가 점검 (PATCH-A15 준용 — Node/npm 생태계)

- 본 spec 에 신규 **npm** 의존성 추가가 있는가? → **없음**. 앱 코드(`apps/backend`) 변경 0건. 오브젝트 복사 도구 `rclone` 은 npm 패키지가 아니라 **시스템 CLI**(alpine 패키지, `apk add rclone`)로 020 러너 이미지에만 추가된다(ADR-002). `@aws-sdk/*` npm 신규 추가 아님 → P-002 준수.
- `[env:e2e-db]` 태그 SC 존재(SC-001·002·003·005·011·013) → 실 오브젝트 스토리지 검증 대상이나 **신규 npm 의존성 추가 없음**. 러너 이미지 확장(rclone 추가)의 검증은 **Deploy Agent** 가 담당(정적 갈음 SC-010: Dockerfile `apk add rclone` 1줄·별도 이미지 0건 정적 검증 + 옵션 A 실 실행). 신규 별도 이미지 도입은 FR-010 이 금지하며 020 이미지 확장만 허용.

## 활성화된 단계 실행 순서

1. 3단계 Design → 4단계 Development + 5a Test(AUTHORING) PPG-1 → 5b → 6단계 Docs
   - (Database Design Agent 비활성 — 3단계 후 별도 선행 산출물 없음)
2. 6단계 후 선택 단계: **Deploy Agent → Security Agent → Performance Agent** (agent-rules §0 캐스케이딩 블로킹 규칙 적용)

> 캐스케이딩: Deploy FAIL 시 Security·Performance 스킵 / Security BLOCKED(Critical·High) 시 Performance 스킵.

## 결정 일시 및 결정자

- 결정 일시: 2026-07-06 14:10 (spawn 기준 — date 도구 미제공, §10/PROC-016-02)
- 결정자: Planning Agent (2단계) — spec.md 근거: DB 스키마 변경 부재(DBDesign N)·FR-010/SC-010(Deploy Y)·NFR-004/FR-001/ADR-009(Security Y)·NFR-001/FR-009(Performance Y)
