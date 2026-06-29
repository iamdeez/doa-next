---
작성: Planning Agent
버전: v1.0
최종 수정: 2026-06-29 17:30
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
  - 근거: FR 에 신규 4테이블(`orders.shipments`·`orders.shipment_tracking`·`settlements.settlements`·`settlements.settlement_items`) + 2 enum(`ShipmentStatus`·`SettlementStatus`) + 신규 `settlements` 스키마 분리 + cross-schema/cross-module plain String 경계 + append-only tracking 인덱스(`(shipmentId, occurredAt desc)`) + 정산 조회 인덱스(`(sellerId, createdAt desc)`) + Decimal(12,2) 금전 필드가 명시됨(spec.md NFR-001). plan.md 데이터 모델 절이 DB Design 입력 contract. SC-050(Decimal 정적) 검증 대상.

- **Deploy Agent**: **N**
  - 근거: FR/NFR 에 배포 환경 구성·컨테이너화·CI/CD 변경 명시 없음. 신규 npm 의존성 0건, Dockerfile/docker-compose 구조 변경 0건. `[env:e2e-docker]` 태그 SC 부재. 003/004 동일 로컬 docker-compose + Fly.io 운영. Prisma 마이그레이션의 Fly release 실행은 운영 영향이나 본 spec 신규 배포 구성 아님(로컬 `prisma migrate dev` 갈음).

- **Security Agent**: **Y**
  - 근거: FR/NFR 에 보안 요구 다수 명시 — (1) **금전 정합성**: 정산액 서버측 Decimal 계산(FR-005, NFR-001). 클라이언트 금액 조작 경로 부재 검증 필요. (2) **권한·IDOR**: 배송 추적 조회 권한 3축(구매자/판매자만, NFR-005, SC-003), 정산 생성·전체 조회 AdminGuard(NFR-004). (3) 인증(NFR-004, SC-052/401). 금전·권한 보안 표면 존재. 정산 멱등성 공백(중복 집계)도 보안 감사 대상.

- **Performance Agent**: **N**
  - 근거: NFR 에 성능 목표 수치(P95 응답속도·처리량) 명시 없음. 정산 집계는 관리자 수동 트리거(저빈도)이며 별도 성능 검증 수치 기준 부재. 배송 추적 조회는 인덱스 설계(DB Design 담당)로 충족. 암묵적 연관으로 활성화하지 않음(MUST NOT).

## 신규 PyPI/npm 의존성 자가 점검

```
자가 점검: 본 spec 에 신규 의존성 추가가 있는가? (package.json dependencies 변경)
  → 없음. 신규 npm 패키지 0건. 기존 Prisma·NestJS·class-validator·@nestjs/event-emitter·@prisma/client(Decimal) 만 사용.
  → 본 항목 무관. (Deploy Agent 비활성, SC-052 가 @aws-sdk 신규 0 정적 검증)
```

## 활성화된 단계 실행 순서

- Database Design Agent: 3단계 후 / 4단계 전 (tasks.md 분해 입력으로 data-model.md·마이그레이션 확정)
- Security Agent: 6단계 후 / 7단계 전

> 캐스케이딩 블로킹: Deploy 비활성 → Security 독립 실행. Security BLOCKED(Critical/High) 시 Performance 스킵 — 단 Performance 비활성(N)이므로 무관. 실제 감사 결과 Critical/High 0건(SEC-FIND-005-01 Medium) → COMPLETE.

## 결정 일시 및 결정자

- 결정 일시: 2026-06-29 17:30
- 결정자: Planning Agent (2단계, retroactive)
