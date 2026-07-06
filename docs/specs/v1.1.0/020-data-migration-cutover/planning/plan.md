---
작성: Planning Agent
버전: v1.0
최종 수정: 2026-07-05 21:16 (spawn 기준 — date 도구 미제공, §10/PROC-016-02)
상태: 확정
---

# Plan: 020-data-migration-cutover

> Branch: 020-data-migration-cutover | Date: 2026-07-05 | Spec: [../spec/spec.md](../spec/spec.md)

## 목차

- [사전 검증 (Constitution Gates)](#사전-검증-constitution-gates)
- [기술 컨텍스트](#기술-컨텍스트)
- [사전 영향도 분석 결과](#사전-영향도-분석-결과)
- [핵심 설계](#핵심-설계)
  - [S1. 전체 아키텍처 — 스테이징 기반 ETL](#s1-전체-아키텍처--스테이징-기반-etl)
  - [S2. 컷오버 시퀀스 (빅뱅, 60분 윈도우)](#s2-컷오버-시퀀스-빅뱅-60분-윈도우)
  - [S3. 델타 캡처 전략 (timestamp 편차 대응)](#s3-델타-캡처-전략-timestamp-편차-대응)
  - [S4. 정합성 검증 하네스](#s4-정합성-검증-하네스)
  - [S5. 롤백 메커니즘 · PoNR](#s5-롤백-메커니즘--ponr)
- [결정 기록 (ADRs)](#결정-기록-adrs)
- [인터페이스 계약](#인터페이스-계약)
- [데이터 모델](#데이터-모델)
- [위험 완화 설계 (PATCH-A06)](#위험-완화-설계-patch-a06)
- [배포 환경 영향 (PROC-009)](#배포-환경-영향-proc-009)
- [외부 도구 동작 검증 (핵심원칙 10)](#외부-도구-동작-검증-핵심원칙-10)
- [테스트 전략](#테스트-전략)
- [기타 고려사항](#기타-고려사항)

---

## 사전 검증 (Constitution Gates)

> `.claude/docs/constitution.md` P-001~P-007 을 기준으로 검증한다. constitution 수치·조건이 무조건 우선한다.
> 본 spec 은 **애플리케이션 코드 변경이 아닌 일회성 데이터 이관·컷오버 운영 절차**를 설계한다. 이관 러너는 NestJS 런타임 밖에서 동작하는 out-of-band 도구다 — 이 성격이 P-001·P-005 판정에 반영된다.

- [x] **P-001 모듈 경계 원칙**: [Pass 기준: 신규 도메인 모듈이 타 스키마 테이블을 직접 참조하지 않음]
  → 이관 러너는 **도메인 모듈이 아니다**. 앱 런타임 요청 경로가 아니라 DB 데이터 플레인에 직접 쓰는 운영 도구이므로 P-001(런타임 모듈 간 경계) 적용 대상 밖. 신규/수정되는 NestJS 도메인 모듈은 없음. **예외 기재**(아래) — 이관은 8개 스키마에 직접 write 하나 이는 설계상 불가피(벌크 로드).
- [x] **P-002 AWS 의존 금지 원칙**: [Pass 기준: `@aws-sdk/*` 등 AWS 전용 패키지·서비스 신규 추가 0건]
  → 이관은 **표준 PostgreSQL 도구**(`pg_dump`/`psql`/`\copy`/`node-postgres`)만 사용. AWS DMS·AWS SDK 신규 도입 없음(ADR-001 에서 DMS 명시 배제). 레거시 RDS 는 표준 PostgreSQL 프로토콜로 접속(AWS 전용 API 아님). **PASS**.
- [x] **P-003 단일 DB 원칙**: [Pass 기준: 단일 PostgreSQL 외 신규 외부 저장소 0건]
  → 타깃은 기존 Fly Postgres 단일 인스턴스. 스테이징은 동일 인스턴스 내 임시 스키마(`migration_staging`). 신규 외부 저장소 없음. **PASS**.
- [x] **P-004 클라우드 중립 원칙**: [Pass 기준: Fly.io 전용 API 에 비즈니스 로직 결합 0건]
  → 이관 러너는 표준 컨테이너·표준 PostgreSQL 접속만 사용. 실행 위치(Fly one-off machine)는 인프라 레이어 결정이며 이관 로직 자체는 플랫폼 독립(로컬·타 클라우드에서도 동일 스크립트 실행 가능). **PASS**.
- [x] **P-005 결제·정산 정합성 원칙**: [Pass 기준: 금전 상태 변경이 outbox+멱등성 없이 처리되지 않음 / 금전 연산은 Decimal·정수만]
  → **예외 기재**(아래). 이관은 결제·환불·정산 *런타임 흐름*이 아니라 기존 확정 레코드의 벌크 복제다. outbox/멱등성 키는 *새로운* 금전 상태 전이에 적용되는 규칙이며, 이관은 상태 전이를 발생시키지 않고 원본 레코드를 그대로 옮긴다. **금전 정합은 (1) `Decimal(12,2)` 값의 byte-exact 복사(부동소수점 미개입) + (2) NFR-003 합계 대조 0원 오차 + (3) SC-016 orders·payments·settlements 교차 참조 무결성(고아 0건)으로 보장**. 이관 시 런타임 결제 경로(PG 호출·이벤트·outbox 재발행)를 우회하는 것은 의도적(부작용 방지). 레거시 `payment_outbox` 의 pending 행은 컷오버 전 0으로 드레인(런북 체크포인트). **PASS(예외 기재)**.
- [x] **P-006 테스트 원칙**: [Pass 기준: SC-XXX 없는 FR-XXX 0건]
  → FR-001~017 전부 SC-001~019 매핑 존재(spec.md 요구사항 구조화 매트릭스). NFR-001~006 도 SC 매핑 존재. **PASS**.
- [x] **P-007 스펙 범위 원칙**: [Pass 기준: spec.md 범위 외 변경 파일 0건]
  → 산출물은 이관 러너 스크립트·매핑 명세·검증 하네스·런북에 한정. 기존 18개 도메인 모듈 코드·schema.prisma 변경 없음. 레거시 해체·실 R2/PG 연동은 범위 외(spec.md 명시). **PASS**.

### 예외 사항

- **P-001 (모듈 경계)**: 이관 러너가 8개 스키마 전체에 직접 write 한다.
  - 근거: 벌크 데이터 이관은 본질적으로 cross-schema 데이터 플레인 작업이며, 도메인 서비스 API 를 경유하면 (a) 부작용(이벤트·outbox·PG stub 호출) 유발, (b) 처리량이 60분 윈도우(NFR-001)를 충족 불가.
  - 대안·완화: 이관 러너는 **앱 런타임과 분리된 일회성 도구**로만 존재하고 프로덕션 코드베이스의 도메인 모듈에 편입하지 않는다(P-007 유지). 이관 종료 후 스테이징 스키마·러너는 폐기.
- **P-005 (결제·정산 정합성)**: 이관은 outbox·멱등성 키 경로를 우회하여 payments/settlements 레코드를 직접 삽입한다.
  - 근거: 위 P-005 판정 참조 — 이관은 신규 금전 전이가 아닌 확정 레코드 복제.
  - 대안·완화: 금액 정합을 NFR-003(합계 0원)·SC-016(교차 참조 무결성)으로 강제 검증하고, 이 검증 실패 시 GO 불가(FR-006/007). 레거시 outbox pending=0 드레인을 컷오버 전제로 런북에 명시.

> 위 2건 예외는 **spec 성격상 불가피한 구조적 예외**이며 constitution 수치 완화가 아니다. main session 이 사용자 승인(Plan Mode) 시 본 예외 2건을 함께 제시한다.

---

## 기술 컨텍스트

- **언어 / 런타임**: 이관 러너 — Node.js 20 + TypeScript(기존 backend 툴체인 재사용) 또는 순수 SQL 스크립트(psql). 표준 `pg_dump`/`psql` CLI 조합.
- **주요 의존성**: 표준 PostgreSQL 클라이언트 도구(`pg_dump`·`pg_restore`·`psql`, PostgreSQL 16 클라이언트), `node-postgres`(pg — 이미 Prisma 전이 의존으로 존재). **신규 npm 의존성 추가는 최소화**(pg 는 기존, 신규 라이브러리 도입 시 P-002·P-003 재점검). Prisma 는 타깃 스키마 정의의 SoT 로만 참조(이관 실행에는 raw SQL·COPY 사용 — Prisma ORM 경로는 처리량 부적합).
- **테스트 프레임워크**: Jest(기존 backend). 정적 검증(런북·매핑 명세 완결성)은 Test Agent 정적 점검. 통합/E2E-db 는 실 레거시·신규 접속 필요 → **옵션 A(사용자 실행 + 결과 전달)** — 테스트 전략 절 참조.
- **소스 / 타깃 토폴로지**: 레거시 = 서비스별 RDS PostgreSQL(다중 소스, 동종 엔진). 타깃 = Fly Postgres 단일 인스턴스 8스키마 33테이블(context.md §4). 엔진 변환 불요.
- **실행 위치**: Fly.io one-off machine(타깃 Postgres 동일 리전 co-located) — ADR-002.

---

## 사전 영향도 분석 결과

### 영향 파일 목록 (신규 산출물 — 기존 앱 코드 무변경)

| 파일(예정 경로) | 변경 유형 | 영향 내용 |
|---|---|---|
| `scripts/migration/` (신규 디렉토리) | 신규 | 이관 러너 스크립트(추출·로드·변환·검증). 앱 런타임 밖 |
| `docs/specs/v1.1.0/020-.../design/mapping-spec.md` | 신규(Design/DB Design) | FR-009/010 필드 단위 매핑 명세 + 변환 규칙 |
| `docs/specs/v1.1.0/020-.../design/runbook.md` | 신규(Design/Deploy) | FR-013 컷오버 런북(체크포인트·담당자·롤백 트리거) |
| `docs/specs/v1.1.0/020-.../design/pre-assessment.md` | 신규 | FR-011 데이터 규모·소요시간 사전평가 리포트 템플릿 |
| `apps/backend/prisma/schema.prisma` | **무변경** | 타깃 스키마는 이미 존재(33테이블). 이관은 데이터만 |
| 기존 18개 도메인 모듈 | **무변경** | 런타임 코드 변경 없음(P-007) |

> 실제 산출물 경로·파일 구성은 Design/DB Design Agent 가 tasks.md 로 확정한다. 위는 Planning 관점 예상 영향 범위.

---

## 핵심 설계

> 작성 깊이: Design/DB Design Agent 가 추가 설계 판단 없이 tasks.md 로 분해 가능한 수준. 필드 단위 매핑 명세(FR-009/010)의 *구체 내용*은 레거시 DDL 실측이 필요하므로 DB Design Agent 최우선 산출물로 위임하되, **매핑 명세 산출 방법론·검증 구조는 본 절에서 확정**한다.

### S1. 전체 아키텍처 — 스테이징 기반 ETL

레거시 스키마(18서비스)와 신규 스키마(8스키마 33테이블)가 1:1 이 아니므로(ASM-002), 원시 `pg_restore` 로는 매핑이 불가능하다. **추출(Extract) → 스테이징 로드(Load) → 변환(Transform) → 타깃 UPSERT** 4단계로 분리한다.

```
[레거시 RDS × N]                    [Fly Postgres (타깃)]
  (서비스별)                         ┌─────────────────────────────────┐
      │  ① Extract                   │  migration_staging (임시 스키마)  │
      │  pg_dump --data-only         │    legacy_<service>_<table> raw   │
      │  / \copy TO                  │            │ ③ Transform (SQL)   │
      └──────────────────────────────┼──►  load   │  UPSERT + 변환규칙    │
         ② Load (COPY FROM)          │            ▼                     │
                                     │  users·products·commerce·orders  │
                                     │  ·payments·settlements·admin·files│
                                     └─────────────────────────────────┘
                                            ④ Verify (count·sum·checksum)
```

- **① Extract**: 레거시 각 서비스 RDS 에서 `pg_dump --data-only --table=...` 또는 `\copy (SELECT ...) TO` 로 테이블별 추출. 사전 복사(FR-002)는 윈도우 개시 전 수행(시간 비제약).
- **② Load**: 추출물을 타깃 인스턴스의 `migration_staging` 스키마에 `COPY FROM` 으로 적재. 스테이징은 레거시 원형을 그대로 보존(변환 전 원본 대조 가능).
- **③ Transform**: 스테이징 → 최종 8스키마로 **위상 순서**(ADR-005: users→products→commerce→orders→payments→settlements→admin→files) UPSERT. 1:1 컬럼은 직접 매핑, 비-1:1 은 변환 규칙(FR-010) 적용. UPSERT(`ON CONFLICT DO UPDATE`)로 **멱등** — 델타 재실행 시 안전.
- **④ Verify**: S4 정합성 하네스.

> **왜 스테이징을 두는가**: (a) 네트워크 바운드 추출(레거시→타깃)을 윈도우 밖 사전 복사로 분리, (b) 변환은 타깃 인스턴스 내부 SQL 로 수행되어 빠름(윈도우 내 시간 절약), (c) 변환 오류 시 스테이징 원본 대조로 디버깅 가능, (d) 델타는 스테이징만 갱신 후 재변환.

### S2. 컷오버 시퀀스 (빅뱅, 60분 윈도우)

| # | 단계 | 시점 | 소요(예상) | 의존 | 롤백 트리거 |
|---|---|---|---|---|---|
| 0 | 사전 복사(pre-copy) 완료 | 윈도우 개시 **전** | 비제약 | — | — |
| 0b | 레거시 `payment_outbox` pending=0 드레인 확인 | 윈도우 개시 전 | — | — | 미드레인 시 개시 보류 |
| 1 | 레거시 쓰기 차단(DB read-only + 앱 점검모드 503) | T+0 (윈도우 개시) | ~2분 | — | — |
| 2 | 최종 델타 이관(스테이징 갱신→재변환) | T+2 | 규모 의존(ASM-001) | 1 | — |
| 3 | 정합성 검증 3종(count·sum·checksum)+교차참조 | T+? | ~5–15분 | 2 | 검증 실패→NO-GO |
| 4 | **GO/NO-GO 판단** (NFR-005: T+50분 이내 완료) | ≤ T+50 | — | 3 | NO-GO→6 |
| 5 | 트래픽 전환(DNS/LB → 신규) + smoke | GO 후 | ~5분 | 4 | smoke 실패→(PoNR 전이면)6 |
| 6 | **롤백**: 레거시 쓰기 차단 해제·트래픽 레거시 유지 | NO-GO 시 | ~2분 | — | — |
| 7 | 윈도우 종료(쓰기 차단 시작~전환 완료 ≤60분, NFR-001) | ≤ T+60 | — | 5 | — |

- **강결합 보장(FR-014/SC-016)**: orders·payments·settlements 는 단계 2에서 함께 변환·로드되고 단계 3에서 교차 참조 무결성(orphan 0)을 GO 게이트로 검증. 빅뱅이므로 부분 전환에 의한 참조 파손 없음.
- **NFR-005 안전마진**: 단계 3·4(검증·판단)를 T+50분 내 완료 → 최소 10분 롤백 여유. 사전평가(FR-011)에서 단계 2 예상 소요가 이 예산을 위협하면 FR-012 재확인.

### S3. 델타 캡처 전략 (timestamp 편차 대응)

> **설계 발견(schema.prisma 실측)**: 대부분 테이블이 `createdAt` 만 보유하고 **`updatedAt` 부재**(User·Seller·Product·Variant·Inventory·UserCoupon 등 — 이들은 status/quantity 를 *갱신*). `updatedAt` 보유는 `Cart` 등 소수. 따라서 **`updatedAt` 워터마크 단독 델타 캡처는 불가능**하다.

테이블을 3부류로 분기하여 델타(FR-004)를 캡처한다:

| 부류 | 예시 | 델타 방식 |
|---|---|---|
| (A) append-only(삽입만, 갱신·삭제 없음) | order_events·inventory_logs·shipment_tracking·refresh_tokens·admin_audit_logs | `createdAt`/`id` 워터마크 증분 추출(사전복사 이후 신규 행만) |
| (B) 갱신형 + 갱신 timestamp 보유 | carts(`updatedAt`) | `updatedAt` 워터마크 증분 |
| (C) 갱신형 + 갱신 timestamp 부재 | users·sellers·products·inventory·user_coupons·orders(상태전이)·payments(상태전이)·settlements 등 | **윈도우 내 full re-copy**(스테이징 truncate+재적재→재변환) |

- 쓰기가 T+0 에 차단되므로 데이터는 그 시점에 동결. (C) 부류 full re-copy 의 총량이 60분 예산을 위협하는지가 핵심 변수 → **ASM-001 규모 실측(FR-011)에 직결**.
- **삭제(hard delete) 탐지**: (C) full re-copy 는 삭제를 자연 반영. (A)/(B) 증분은 삭제 미탐지 → 단계 3 레코드 수 대조(NFR-002, 불일치 0건)가 최종 안전망(불일치 시 NO-GO).
- **per-table 분류 확정**은 DB Design Agent 가 매핑 명세에서 각 (레거시)테이블의 timestamp 컬럼·mutability 인벤토리를 산출하며 완성한다(본 절은 방법론·분기 규칙 확정).

### S4. 정합성 검증 하네스

FR-005 의 3종 + FR-014 교차참조를 SQL 기반 리포트로 산출(NFR-006 감사 기록).

1. **(a) 레코드 수 대조**(NFR-002, 불일치 0건): 신규 33테이블 각각 `SELECT count(*)` vs 레거시 대응 소스 합. 비-1:1(병합) 테이블은 매핑 명세의 "대응 소스 집합" 기준으로 기대 카운트 산정(FR-010 변환 규칙에 카운트 기대식 포함).
2. **(b) 금전 합계 대조**(NFR-003, 오차 0원): `SELECT sum(orders.orderItems.? )`… 구체적으로 `orders.order_items.unitPrice*quantity`·`orders.orders.totalAmount`·`payments.payments.amount`·`settlements.settlements.payoutAmount`(및 `saleAmount`·`commission`) 합계를 `Decimal` 그대로 비교(부동소수점 미개입 — P-005). spec.md SC-006 은 `orders.totalAmount`·`payments.amount`·`settlements.payoutAmount` 명시.
3. **(c) 샘플 체크섬**(SC-007, 스키마당 ≥100건 또는 1% 중 큰 값): 무작위 샘플 행에 대해 **매핑된 비즈니스 키·컬럼의 정규화 projection** 을 해시(`md5(normalized_row::text)`) 비교. 원시 row md5 는 스키마 재구조화(비-1:1)로 불가하므로 **매핑 후 컬럼 집합 기준**으로 산정(변환 규칙 검증 겸함).
4. **교차 참조 무결성**(SC-016, orphan 0): `settlement_items.orderItemId` → `order_items.id`, `payments.orderId` → `orders.id`, `refunds.paymentId` → `payments.id` 등 강결합 참조에 대해 anti-join(`LEFT JOIN … WHERE 우측 IS NULL`)으로 고아 0건 확인.

> 검증 리포트는 파일(JSON/MD) + 선택적 감사 테이블(`migration_staging.verification_runs`)로 저장(NFR-006, SC-022). GO 게이트: 1·2·3·4 전부 PASS(FR-006).

### S5. 롤백 메커니즘 · PoNR

- **PoNR 이전 롤백(FR-007)**: 트래픽 미전환 또는 전환 후 신규 주문/결제 0건 상태 → 롤백 = (1) 레거시 DB read-only 해제(쓰기 재개), (2) 트래픽을 레거시로 유지/재지정, (3) 타깃·스테이징 데이터 폐기(재시도 대비 보존 가능). 역이관 불필요 — 레거시가 원본이고 손실 없음.
- **PoNR(FR-008)**: 트래픽 전환 후 **신규 시스템에서 새 주문 또는 결제 1건 발생** 시점. 이후 자동 역이관 미지원(범위 외). 런북에 PoNR 경고 단계 명시(SC-010).
- **PoNR 판정 신호**: 신규 `orders.orders` 또는 `payments.payments` 에 컷오버 시각 이후 `createdAt` 레코드 존재 여부로 판정(런북 체크포인트).

---

## 결정 기록 (ADRs)

> spec.md 요구사항 구조화 매트릭스의 FR/NFR 행을 plan 결정에 매핑한다. Design Agent research.md "기술 선택 조사"·DB Design Agent 매핑 명세와 cross-reference.

| ADR-ID | 결정 항목 | 채택안 | 대안 (검토·미채택) | 근거 (spec FR/NFR) | 영향 범위 |
|---|---|---|---|---|---|
| ADR-001 | 이관 도구·방식 | **스테이징 기반 ETL**(pg_dump/COPY 추출·로드 + SQL UPSERT 변환) | 논리적 복제(publication/subscription) — *동일 스키마 전제라 재구조화 불가*; `pg_restore` 직접 복원 — *비-1:1 매핑 불가*; AWS DMS — *P-002/P-004 위반, AWS 결합*; 앱 API 재수집 — *부작용·처리량 부적합* | FR-001·002·004·009·010, NFR-001, P-002/004 | scripts/migration, 타깃 staging 스키마 |
| ADR-002 | 이관 러너 실행 위치 | **Fly.io one-off machine**(타깃 Postgres 동일 리전 co-located) | 로컬 PC — *양방향 대역폭·가정 네트워크 신뢰성 낮음*; 상시 전용 러너 — *일회성에 과비용*; 레거시측 EC2 — *타깃 write 가 인터넷 경유* | ASM-009, NFR-001·005 | 실행 인프라, 런북 |
| ADR-003 | 레거시 쓰기 차단 방식 | **DB read-only(`default_transaction_read_only`/REVOKE) = 하드 차단 + 앱 점검모드 503 = UX** | 앱 점검모드 단독 — *비-API 숨은 쓰기 경로 누출 위험(사후검증 시나리오 c)*; DB 차단 단독 — *사용자 503 UX 부재* | FR-003, NFR-002, SC-003 | 레거시 인프라, 런북 |
| ADR-004 | 델타 캡처 전략 | **테이블 3분기**: append-only=createdAt/id 워터마크 · 갱신+updatedAt=updatedAt 워터마크 · 갱신-무timestamp=**윈도우 내 full re-copy** | updatedAt 워터마크 일괄 — *대부분 테이블 updatedAt 부재(실측)로 불가*; 논리 복제 슬롯 CDC — *동일스키마 전제·복잡도*; 전 테이블 full re-copy — *규모 시 60분 초과 위험* | FR-004, NFR-001, SC-004, ASM-001 | 러너 델타 로직, 사전평가 |
| ADR-005 | 로드 위상 순서 | users→products→commerce→orders→payments→settlements→admin→files | 임의 순서 — *cross-ref(plain String) 논리 무결성 위험* | FR-014, SC-016, ASM-006 | 변환 SQL 순서 |
| ADR-006 | 정합성 검증 방식 | **SQL 하네스 3종(count·Decimal sum·매핑후 sample checksum) + 교차참조 anti-join** | 원시 row md5 전수 — *재구조화로 불가·비용*; 레코드 수만 — *금액·구조 오류 미탐* | FR-005, NFR-002/003, SC-005/006/007/016 | 검증 하네스, 리포트 |
| ADR-007 | 롤백 모델 | **PoNR 이전 트래픽 재지정 + 레거시 쓰기 해제(역이관 없음)** | 양방향 동기화 역이관 — *dual-write 범위 외·복잡도*; 스냅샷 복원 — *레거시가 원본이라 불요* | FR-007/008, SC-009/010 | 런북 롤백 절차 |
| ADR-008 | 금전 레코드 이관 경로 | **런타임 결제 경로 우회 · 확정 레코드 직접 삽입**(outbox/PG stub 미개입) + 레거시 outbox pending=0 드레인 전제 | 런타임 결제 API 재생 — *PG stub 호출·이벤트 중복·처리량 부적합* | FR-005, P-005(예외), NFR-003, SC-006 | payments/settlements 변환, 런북 |
| ADR-009 | 전송 채널 보안 | **양단 접속 `sslmode=require` 이상 TLS** + 자격증명 secret 주입(평문 로그 금지) | 평문 접속 — *NFR-004 위반·PII/결제 노출* | FR-015, NFR-004, SC-017, ASM-008 | 러너 접속 설정 |
| ADR-010 | 이관 감사 기록 | **구조적 로그 파일 + `migration_staging.verification_runs` 감사 테이블**(단계별 시작·종료·검증결과) | 표준출력만 — *감사 불가·SC-022 미충족* | NFR-006, SC-022 | 러너 로깅, 검증 하네스 |

> 본 표는 DB Design Agent 매핑 명세·Design Agent research.md 와 cross-reference 한다. ADR 미작성 결정이 design 단계에 발견되면 status: BLOCKED 로 Planning 복귀.

---

## 인터페이스 계약

본 spec 은 앱 런타임 인터페이스(HTTP API)를 신설·변경하지 않는다. "인터페이스 계약"은 이관 러너와 양단 DB·운영 절차 간의 계약이다.

- **레거시 소스 계약(읽기 전용)**: 레거시 각 서비스 RDS 에 `SELECT`/`\copy` read-only 접근. 컷오버 단계 1 이후 read-only 전환(ADR-003). 러너는 레거시 스키마를 **수정하지 않는다**(추출만).
- **타깃 계약(write)**: Fly Postgres 에 `migration_staging` 임시 스키마 생성 권한 + 8개 최종 스키마 write 권한 필요. pg-boss 가 이미 앱 기동 시 `pgboss` 스키마를 CREATE 하므로(infra.md §8) 러너 사용자도 CREATE 권한 보유 전제 — 런북 사전점검 항목.
- **UPSERT 멱등 계약**: 변환은 `INSERT … ON CONFLICT (id) DO UPDATE` 로 재실행 안전. 델타 재변환·검증 실패 후 재시도 시 중복 삽입 없음.
- **결제 outbox 계약(ADR-008)**: 컷오버 전 레거시 `payment_outbox` pending=0 드레인. 타깃 `payments.payment_outbox` 는 pending 행 없이(또는 완결 상태로만) 이관 → 신규 `OutboxRelay` 가 이관 직후 유령 재발행하지 않도록 보장. 런북 체크포인트(SC-022 로그).
- **하위 호환**: 신규 시스템 코드·스키마 무변경이므로 기존 통합에 런타임 영향 없음(P-002 호환성). 이관은 데이터 적재만.

> **(PATCH-001/PROC-003) 인가 3축**: 본 spec 은 권한 부여·상태 전이 HTTP 엔드포인트를 신설하지 않으므로 인가 3축 표는 비해당. 대신 **이관 러너 실행 권한**(레거시·타깃 DB 자격증명 취급, ASM-010·ASM-011)이 상응하는 접근 통제 표면이며 Security Agent 감사 대상이다.

---

## 데이터 모델

- **타깃 스키마 무변경**: 신규 8스키마 33테이블은 이미 존재(context.md §4). 이관은 데이터만 적재하며 DDL 을 변경하지 않는다.
- **임시 스테이징 스키마**: `migration_staging`(이관 종료 후 DROP). 레거시 원형 테이블 raw 보존 + `verification_runs` 감사 테이블.
- **매핑 명세(FR-009/010)는 별도 산출물**: 레거시 18서비스 DDL ↔ 신규 33테이블 필드 단위 매핑표 + 비-1:1 변환 규칙. **DB Design Agent 최우선 산출물**(`design/mapping-spec.md`)로 위임 — 레거시 실 DDL 실측이 선행되어야 구체화 가능(ASM-002). 본 plan 은 매핑표의 **필수 컬럼**(레거시 서비스·테이블·컬럼 / 신규 스키마·테이블·컬럼 / 1:1여부 / 변환규칙 / 카운트 기대식)과 **완결성 기준**(신규 33테이블 전부 최소 1회 등장 — SC-011)을 확정한다.
- **cross-schema plain String 참조 주의**: 신규 시스템은 스키마 간 FK 미선언(P-001, context.md §6). 이관 시 DB 가 참조 무결성을 강제하지 않으므로 **S4 교차참조 검증(anti-join)이 유일한 무결성 게이트**(SC-016).

---

## 위험 완화 설계 (PATCH-A06)

assumptions.md 의 "확인 필요 = 예"(중간/높음 + Planning/Design 실측) 항목 2건의 부정 검증 대비 안전망:

| ASM | 리스크 | 안전망 설계 | spec 매핑 |
|---|---|---|---|
| ASM-001 데이터 규모 미상 | 규모 과대 시 60분 윈도우(NFR-001) 초과 | (1) FR-011 사전평가 리포트(테이블별 행수·용량·예상소요·윈도우 여유율) 강제, (2) 예상소요가 NFR-005 안전마진(50분) 초과 예상 시 **FR-012 사용자 재확인**(윈도우 재산정 또는 부분 사전이관), (3) 부분 사전이관 fallback: (C)부류 대형 테이블을 사전에 스테이징 변환해두고 윈도우엔 델타만 재변환 | FR-011/012, NFR-001/005, SC-013/014 |
| ASM-002 매핑 복잡도 미상 | 매핑 과복잡 시 변환 로직 윈도우 초과·오류 | (1) FR-009/010 매핑 명세를 **DB Design Agent 최우선 선행 산출물**로, (2) 변환 규칙 비-1:1 전건 문서화(SC-012), (3) 스테이징 기반 사전 변환으로 변환 부하를 윈도우 밖으로 이동(S1), (4) S4 검증(count·sum·checksum·교차참조)이 변환 오류의 최종 탐지 게이트 | FR-009/010, SC-011/012/016 |

> 두 안전망 모두 FR/NFR/SC 매핑 존재 → BLOCKED 불요. 안전망 부정 검증(실측 후 초과) 시 FR-012 흐름으로 사용자 재확인.

---

## 배포 환경 영향 (PROC-009)

본 spec 은 배포·운영 환경 특이성의 영향을 크게 받는다(컷오버 = 배포 운영):

- **Fly Postgres 단일 장애점(infra.md §8)**: 컷오버 시점 신규 시스템이 단일 DB 인스턴스. 이관 중/직후 DB 장애 시 전체 다운. HA 도입 여부 결정은 spec 범위 외(spec.md 명시)이나, **컷오버 직전 Fly Postgres 자동 백업+PITR 활성 확인**을 런북 사전점검 항목으로 반영(장애 시 복구 경로). → Deploy Agent 검토.
- **트래픽 전환(DNS/LB)**: 단계 5 트래픽 전환은 DNS TTL·LB 헬스체크 전파 지연 가능(사후검증 시나리오 d). 런북에 전파 확인·smoke 절차 명시. → Deploy Agent.
- **scale-to-zero 콜드 스타트(infra.md §8)**: 전환 직후 첫 요청 지연 → 컷오버 시 최소 1인스턴스 유지 설정 권장(런북).
- **release command `prisma migrate deploy`(infra.md §3)**: 신규 시스템 배포 시 자동 실행 — 이관 실행 전 타깃 마이그레이션 최신(`migrate status` up-to-date) 확인 런북 항목. GAP-005-03(마이그레이션 드리프트, accepted)은 `migrate deploy` 정상 동작으로 무영향.
- **pg-boss CREATE 권한(infra.md §8)**: 러너 사용자 CREATE 권한 전제(스테이징 스키마 생성).

> critical 추정(DB 장애 시 서비스 중단)은 위 백업/PITR 확인·HA 검토로 완화. Design Agent research.md "배포 환경 영향 추정"과 cross-check.

---

## 외부 도구 동작 검증 (핵심원칙 10)

spec 가정이 의존하는 외부 도구 동작을 확인한다(silent failure 한계 포함 — PATCH-A07):

- **논리적 복제 = 동일 스키마 전제**: PostgreSQL logical replication(publication/subscription)은 소스·타깃 테이블 구조 일치를 요구한다(컬럼명·타입). 본 이관은 재구조화(비-1:1)이므로 적용 불가 — ADR-001 에서 배제. (근거: PostgreSQL 공식 문서 Logical Replication — 열 구조 일치 요구.)
- **`pg_dump --data-only` + `COPY`**: 데이터만 추출·적재. 제약조건·트리거 미포함(스테이징에 raw 적재 목적에 부합). COPY 는 트랜잭션 단위 원자 적재.
- **`ON CONFLICT DO UPDATE` 멱등**: 델타 재실행 시 PK 충돌을 UPDATE 로 흡수 — 재시도 안전(ADR-004).
- **인정되는 한계(silent failure)**:
  - (a) **hard delete 미탐지**: append-only/updatedAt 증분 델타는 삭제를 못 잡는다 → 안전망 = 레코드 수 대조(NFR-002) NO-GO 게이트(S3).
  - (b) **updatedAt 부재 테이블**: 실측상 대부분 테이블이 updatedAt 미보유 → full re-copy 로 흡수(ADR-004). per-table 최종 분류는 DB Design 매핑 명세에서 확정.
  - (c) **레거시 숨은 쓰기 경로**: 앱 점검모드만으로는 배치·크론 등 비-API 쓰기가 누출될 수 있음 → DB read-only 하드 차단(ADR-003)으로 흡수.
- **레거시 실 DDL 검증은 Design/DB Design 위임**: 레거시 18서비스 실 스키마는 본 파이프라인에서 접근 불가(사용자 환경) → 매핑 명세 산출 시 사용자 제공 DDL 또는 실측(옵션 A)으로 확정. 미확정 매핑은 `[TO-VERIFY: 레거시 <서비스>.<테이블> DDL — DB Design 실측]` 마커로 표기(PATCH-002).

---

## 테스트 전략

> 테스트 수준: 단위 / 통합 / E2E. env 태그(static/integration/e2e-db)는 spec.md SC 에 명시됨.
> **defer 옵션 결정(PATCH-A08)**: 실 레거시 AWS RDS 접속이 필요한 검증(integration·e2e-db)은 파이프라인 자동 실행 불가(자격증명·네트워크가 사용자 환경). spec.md 가 **옵션 A(사용자 실행 + 결과 전달)** 를 확정 채택했다 — main session/산출물이 실행 절차(스크립트·명령)를 제시 → 사용자 실행 → 결과(리포트) 전달 → Test/Deploy Agent 검증.

| SC | 수준 | 유형 | 시나리오 요약 | 입력 | 기대 결과 |
|---|---|---|---|---|---|
| SC-001 | E2E-db | Happy | 이관 후 8스키마 전 테이블에 레거시 대응 데이터 존재 | 레거시 스냅샷 | 33테이블 전부 row>0(빈 소스 제외) |
| SC-002 | 통합 | Edge | 사전복사 시점 레거시-신규 레코드 수 차 ≤ 델타 임계치 | pre-copy 완료 상태 | 차이 ≤ 임계치(직전 N분 변경률) |
| SC-003 | 통합 | Error | 윈도우 개시 후 레거시 쓰기(POST/PUT/PATCH/DELETE) 차단 | 쓰기 요청 | 503(점검) 또는 DB read-only 거부 일관 반환 |
| SC-004 | 통합 | Happy | 델타 이관 후 마지막 변경 레코드 일치 | 워터마크 기준 | 레거시=신규 최신 레코드 일치 |
| SC-005 | E2E-db | Happy | 레코드 수 대조 100% 일치 | 이관 완료 상태 | 전 대상 테이블 불일치 0건(NFR-002) |
| SC-006 | E2E-db | Happy | 금전 합계(order.totalAmount·payment.amount·settlement.payoutAmount) 대조 | 이관 완료 | 오차 0원(NFR-003, Decimal exact) |
| SC-007 | E2E-db | Edge | 무작위 샘플(스키마당 ≥100 또는 1%) 체크섬 일치 | 랜덤 샘플 | 매핑후 projection 해시 일치 |
| SC-008 | 정적 | Happy | 런북에 "SC-005~007 PASS 시에만 GO" 명시 | runbook.md | 문구 존재 |
| SC-009 | 통합 | Error | 검증 실패 리허설 시 전환 미진행·쓰기차단 해제 | 의도적 불일치 주입 | NO-GO·레거시 서비스 재개(FR-007) |
| SC-010 | 정적 | Happy | 런북에 PoNR(신규 주문/결제 1건→롤백불가) 경고 단계 | runbook.md | 경고 단계 존재 |
| SC-011 | 정적 | Happy | 매핑표에 신규 33테이블 전부 최소 1회 등장 | mapping-spec.md | 누락 0 |
| SC-012 | 정적 | Edge | "1:1 아님" 항목 전건 변환 규칙 기재 | mapping-spec.md | 변환규칙 누락 0 |
| SC-013 | 정적 | Happy | 사전평가 리포트에 테이블별 행수·예상소요·여유율 기재 | pre-assessment.md | 3항목 존재 |
| SC-014 | 정적 | Error | 예상소요 > 50분 시 "진행 전 사용자 재확인 필수" 체크포인트 | 초과 시나리오 | 런북 체크포인트 존재(FR-012) |
| SC-015 | 정적 | Happy | 런북 각 단계에 담당자·체크포인트·롤백트리거 기재 | runbook.md | 누락 0 |
| SC-016 | E2E-db | Happy | orders·payments·settlements 교차참조 무결성(orphan 0) | 이관 완료 | anti-join 고아 0건(FR-014) |
| SC-017 | 정적 | Happy | 러너 DB 연결에 TLS(sslmode=require↑) 적용 | 러너 설정 | sslmode 설정 확인(NFR-004) |
| SC-018 | 정적 | Happy | 런북에 D-3일 전 공지 체크포인트(채널·완료란) | runbook.md | 체크포인트 존재 |
| SC-019 | 정적 | Edge | 검증 대상에 file_assets 메타 카운트 포함·바이너리 검증 명시 제외 | scope/verify 문서 | 포함·제외 각 명시 |
| SC-020 | E2E-db | Happy | 리허설/실행 로그 "쓰기차단~전환완료" ≤60분 | 실행 로그 | 시각차 ≤60분(NFR-001) |
| SC-021 | E2E-db | Edge | 리허설 로그 검증·GO/NO-GO ≤50분 | 실행 로그 | ≤50분(NFR-005) |
| SC-022 | 통합 | Happy | 실행 로그(단계별 시각·검증결과) 감사 형태 저장 | 실행 로그 | 파일/감사테이블 저장 확인 |

### PROC-010 옵션 관련 자가 점검 (옵션 A 채택 — 옵션 C 미채택이나 자가점검 준용)

1. **운영 환경 의존성 평가**: Y — 결함 발견이 레거시 배포 토폴로지·실 데이터·트래픽 전환 인프라에 의존(SC-001~007·016·020·021 은 실 레거시 접속 필수).
2. **mock 시뮬레이션 불가 시나리오**: 실 데이터 규모(ASM-001)·레거시 숨은 쓰기 경로·DNS/LB 전파 지연·실 금액 합계는 mock 재현 불가.
3. **권장**: 위 1·2 가 Y 이므로 **옵션 A 채택**(spec 확정). 정적 검증(런북·매핑·설정 완결성)은 파이프라인 내 자동 수행, 실 데이터 검증은 사용자 실행+결과 전달. 옵션 A 결과 미도래 구간은 운영 모니터링(infra.md §4)·검증 리포트(NFR-006)로 보완.

### PROC-014 사후 운영 검증 피드백 사이클

spec.md "사후 운영 검증 피드백 사이클" 절에 이미 명시(시나리오 a~d, 결함 발견 시 spec 수정 이벤트→cycle N+1 또는 patch spec, CHANGES.md/context.md 추적). 본 plan 은 이를 승계하며, 리허설(dry-run) 1회 이상 선행을 런북에 권고(SC-020/021 리허설 로그 활용).

### smoke_tests

- 필요 여부: **N** — 본 spec 은 신규 앱 코드 변경이 없어(P-007) 기존 SC 범위 밖 회귀 유발 경로가 없다. 컷오버 후 신규 시스템 smoke 는 런북 단계 5(트래픽 전환 후 smoke)로 다루며 이는 SC-020 흐름에 포함.

---

## 기타 고려사항

- **동시성·공유상태(01-design-rules §6)**: 이관 러너는 단일 실행 주체(사용자/오너, ASM-011)의 순차 실행 전제 — 병렬 다중 러너 미상정. UPSERT 멱등(ADR-004)으로 재시도 안전. 스테이징은 단일 러너 소유이므로 레이스 없음. 병렬 러너 도입 시(처리량 목적) per-스키마 파티션 격리 필요 — 본 spec 미채택(윈도우 예산은 사전평가로 관리).
- **스테이징 생명주기**: 이관·검증 종료 후 `migration_staging` DROP. 롤백 대비 재시도 가능성 있으므로 PoNR 이전에는 보존, 컷오버 성공 확정(ASM-003: 7일 무장애 관찰) 후 정리 권고.
- **`[TO-VERIFY]` 위임**: 레거시 18서비스 실 DDL·실 데이터 규모는 파이프라인 접근 불가 → 매핑 명세·사전평가에서 사용자 제공/실측으로 확정. 코드 예시에 미검증 리터럴 대신 마커 사용(PATCH-002).
- **결제 PG·R2 stub 무관성**: payments 는 레코드만 이관(실 PG stub 상태와 무관, spec.md 범위외 확인). file_assets 는 메타 레코드만(바이너리 제외, FR-017/ASM-012).
- **감사 로그 마스킹**: NFR-006 실행 로그에 PII/결제 원문·DB 자격증명 평문 금지(ADR-009). Security Agent 감사 대상.
</content>
