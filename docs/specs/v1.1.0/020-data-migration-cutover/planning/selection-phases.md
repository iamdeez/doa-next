---
작성: Planning Agent
버전: v1.0
최종 수정: 2026-07-05 21:16 (spawn 기준 — date 도구 미제공, §10/PROC-016-02)
상태: 확정
---

# selection-phases.md

> 활성화 원칙: spec.md 의 FR/NFR 에 **명시적 요구사항이 존재할 때만** 활성화. 암묵적 연관 금지.

## 선택 단계 활성화 결정

- **Database Design Agent: Y**
  - 근거: FR-009(레거시 18서비스 ↔ 신규 8스키마 33테이블 **필드 단위 매핑 명세**)·FR-010(비-1:1 변환 규칙 문서화)이 명시. 매핑 명세·변환 SQL·스테이징→타깃 UPSERT 설계가 본 이관의 **핵심 산출물**이며, per-table timestamp/mutability 인벤토리(ADR-004 델타 분기)·카운트 기대식(S4 검증)도 DB 설계 영역. ASM-002(매핑 복잡도, 최대 리스크)를 **최우선 선행 산출물**로 해소. 실행 위치: 3단계 후/4단계 전.

- **Deploy Agent: Y**
  - 근거: FR-003(레거시 쓰기 차단 — 점검모드/DB 접근 제한)·FR-013(단계별 체크포인트·롤백 트리거 포함 **컷오버 런북**)·S2 트래픽 전환(DNS/LB)·ADR-002(Fly one-off machine 러너 프로비저닝)이 명시적 배포·운영 구성 활동. infra.md §8 배포 환경 특이성(Fly Postgres 단일 장애점·백업/PITR·scale-to-zero·`prisma migrate deploy` release command)의 컷오버 영향 검토가 필요. 실행 위치: 6단계 후/7단계 전(순서 1번).

- **Security Agent: Y**
  - 근거: FR-015(개인정보 PII·결제 데이터 이관 채널 **암호화 전송**)·NFR-004(TLS sslmode=require↑)·ADR-009(자격증명 취급)·ASM-008/010/011(레거시 AWS 자격증명·실행 주체 접근 통제)이 명시. 이관 러너의 DB 자격증명 취급·감사 로그 마스킹(NFR-006)·레거시 read-only 하드 차단(ADR-003)이 보안 감사 대상. 실행 위치: 6단계 후/7단계 전(순서 2번).

- **Performance Agent: Y**
  - 근거: NFR-001(윈도우 ≤60분)·NFR-005(검증·GO/NO-GO ≤50분)의 **수치 성능 목표**·FR-011(테이블별 행수·예상소요·윈도우 여유율 사전평가)이 명시. 윈도우 예산 모델·처리량 산정·델타 full re-copy(ADR-004) 소요 평가가 성능 엔지니어링 영역. **한계 명시**: 실 처리량 측정은 ASM-001(데이터 규모) 실측이 사용자 환경 의존(옵션 A) — Performance Agent 는 예산 모델·사전평가 방법론·병목 식별을 담당하고 실측 수치 확보는 사용자 실행 결과로 보완. 실행 위치: 6단계 후/7단계 전(순서 3번).

## 신규 npm 의존성 자가 점검 (PATCH-A15 준용 — Node/npm 생태계)

- 본 spec 에 신규 npm 의존성 추가가 있는가? → **없음(원칙)**. 이관 러너는 표준 `pg_dump`/`psql` CLI + 기존 전이 의존 `pg`(node-postgres) 재사용. 신규 라이브러리 도입 시 P-002(AWS SDK 금지)·P-003(단일 DB) 재점검.
- `[env:e2e-db]` 태그 SC 존재(SC-001·005·006·007·016·020·021) → 실 DB 검증 대상이나 신규 의존성 추가 없음. Deploy Agent 활성화는 의존성 사유가 아닌 **컷오버 운영·런북·러너 프로비저닝** 사유로 결정(위).

## 활성화된 단계 실행 순서

1. **Database Design Agent** (3단계 후 / 4단계 전) — 매핑 명세·변환 설계 선행
2. 4단계 Development + 5a Test(AUTHORING) PPG-1 → 5b → 6단계 Docs
3. 6단계 후 선택 단계: **Deploy Agent → Security Agent → Performance Agent** (agent-rules §0 캐스케이딩 블로킹 규칙 적용)

> 캐스케이딩: Deploy FAIL 시 Security·Performance 스킵 / Security BLOCKED(Critical·High) 시 Performance 스킵.

## 결정 일시 및 결정자

- 결정 일시: 2026-07-05 21:16 (spawn 기준 — date 도구 미제공)
- 결정자: Planning Agent (2단계) — spec.md FR-009/010·FR-003/013·FR-015/NFR-004·NFR-001/005/FR-011 명시 근거
</content>
