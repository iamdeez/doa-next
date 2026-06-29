---
작성: Planning Agent
버전: v1.0
최종 수정: 2026-06-29 19:01
상태: 확정 (retroactive)
---

# selection-phases.md

## 목차

- [선택 단계 활성화 결정](#선택-단계-활성화-결정)
- [신규 PyPI/npm 의존성 자가 점검](#신규-pypinpm-의존성-자가-점검)
- [활성화된 단계 실행 순서](#활성화된-단계-실행-순서)
- [결정 일시 및 결정자](#결정-일시-및-결정자)

## 선택 단계 활성화 결정

> 활성화 기준: spec.md FR/NFR 에 **명시적 요구사항**이 존재할 때만 활성화(암묵적 연관 금지).

- **Database Design Agent**: **Y**
  - 근거: FR-002 에 `SettlementItem.orderItemId @unique` DB 제약 + 008 마이그레이션(`settlement_items_orderItemId_key` UNIQUE INDEX)이 명시됨. 기존 테이블에 무결성 제약을 추가하는 변경이므로 DB Design 이 data-model.md(제약 변경분) + 마이그레이션을 확정한다. SC-003(정적) 검증 대상.

- **Deploy Agent**: **N**
  - 근거: FR/NFR 에 배포 환경 구성·컨테이너화·CI/CD 변경 명시 없음. 신규 npm 의존성 0건, Dockerfile/docker-compose 구조 변경 0건. 신규 env 0. 005 와 동일 로컬 docker-compose + Fly.io 운영.

- **Security Agent**: **Y**
  - 근거: 본 spec 의 직접 목적이 005 보안 발견(SEC-FIND-005-01, Medium — 정산 멱등성/무결성 공백)의 해결이다. Security Agent 가 (1) 멱등성 확보(기집계 제외 + `@unique`), (2) 중복 지급액 차단, (3) P-005 금전 정합성 완전이행을 검증하고 SEC-FIND-005-01 의 RESOLVED 판정을 확정한다.

- **Performance Agent**: **N**
  - 근거: NFR 에 성능 목표 수치(P95·처리량) 명시 없음. 기집계 조회(`findSettledOrderItemIds`)는 `orderItemId IN (...)` 단일 인덱스 조회이며 별도 성능 게이트 대상 부재.

## 신규 PyPI/npm 의존성 자가 점검

```
자가 점검: 본 spec 에 신규 의존성 추가가 있는가? (package.json dependencies 변경)
  → 없음. 신규 npm 패키지 0건. 기존 Prisma·NestJS 만 사용.
  → 금액 재계산은 Prisma.Decimal(@prisma/client 내장)만 사용.
  → 본 항목 무관. (Deploy Agent 비활성)
```

## 활성화된 단계 실행 순서

- Database Design Agent: 3단계 후 / 4단계 전 (data-model.md 제약 변경분 + 마이그레이션 확정)
- Security Agent: 6단계 후 / 7단계 전 (SEC-FIND-005-01 RESOLVED 검증)

> 캐스케이딩 블로킹: Deploy 비활성 → Security 독립 실행. 감사 결과 Critical/High/Medium 0건(SEC-FIND-005-01 RESOLVED) → COMPLETE.

## 결정 일시 및 결정자

- 결정 일시: 2026-06-29 19:01
- 결정자: Planning Agent (2단계, retroactive)
