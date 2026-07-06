---
작성: Performance Agent
버전: v1.0
최종 수정: 2026-07-05 23:19
상태: 확정
---

# 성능 측정 및 최적화 결과

## 목차

- [검토 범위](#검토-범위)
- [Constitution 성능 원칙 조항 이행 현황](#constitution-성능-원칙-조항-이행-현황)
- [성능 목표](#성능-목표)
- [Baseline 측정 결과](#baseline-측정-결과)
- [병목 지점 분석](#병목-지점-분석)
- [최적화 적용 내역](#최적화-적용-내역)
- [최종 측정 결과](#최종-측정-결과)
- [미달성 항목 및 사유](#미달성-항목-및-사유)
- [회귀 테스트 결과](#회귀-테스트-결과)
- [종합 판정](#종합-판정)

---

## 검토 범위

DIFF(`docs/specs/v1.1.0/DIFF-020-data-migration-cutover.md`, base `1dd5132`) + Security Agent 재확인 범위(`security-report.md`)를 기준으로 다음을 직접 Read/실측했다.

- `scripts/migration/PRE-ASSESSMENT.md` — NFR-001/005 게이트 구조
- `scripts/migration/sql/10_transform.sql` — 변환 UPSERT SQL 8개 스키마
- `scripts/migration/sql/20_verify.sql` — 검증 4종(count/sum/checksum/antijoin)
- `scripts/migration/sql/00_staging_ddl.sql` — 스테이징 DDL(인덱스 유무)
- `scripts/migration/extract.sh` · `load.sh` — 레거시 추출·스테이징 적재 메커니즘(`\copy` 사용 여부)
- `scripts/migration/run.sh` — 컷오버 오케스트레이션(`do_precopy`/`do_delta`/`do_verify`/`do_go_nogo`/`do_window_close`), `for_each_legacy_service` 순차/병렬 여부
- `scripts/migration/delta-classes.conf` — per-table 델타 부류(FULL/WATERMARK) 및 처리량 지배 변수
- `docs/specs/v1.1.0/020-data-migration-cutover/design/research.md` — §영향 범위 분석·로드 위상 순서 검증(ADR-005)·엣지 케이스
- `docs/specs/v1.1.0/020-data-migration-cutover/spec/spec.md` — NFR-001/005, SC-020/021
- `docs/specs/v1.1.0/020-data-migration-cutover/test/coverage.md`·`test-report.md` — SC-020/021 처리 방식(옵션A 위임 여부 확인)

**제외**: `apps/backend/src`·`apps/backend/prisma`(도메인 코드) — `git diff 1dd5132 --stat -- apps/backend/src apps/backend/prisma` 0건(Deploy·Security 재확인 결과와 교차 일치), 본 spec 은 앱 런타임 성능에 영향 없음(P-007, 이관 도구는 out-of-band).

**실측 한계(옵션 A 전제)**: 레거시 실 DB 접근이 파이프라인에서 불가하므로(spec.md "사후 검증 활동 실행 방식"), 실제 행수·실측 처리량·리허설 소요 시간은 본 단계에서 측정 불가하다. 본 검토는 **구조적/정적 검증**(PRE-ASSESSMENT 게이트 완결성 + SQL/스크립트 효율성 정적 분석)으로 한정한다. NFR-001/005 의 실측 검증(SC-020/021)은 `test/coverage.md`·`test-report.md` 가 이미 "옵션A-계약검증"으로 정확히 라우팅해 두었다(사용자 리허설 실행 시 검증).

---

## Constitution 성능 원칙 조항 이행 현황

`.claude/docs/constitution.md` P-001~P-007 순회 결과, 별도의 성능 전용 조항은 없다(P-001 모듈 경계·P-002 AWS 의존 금지·P-003 단일 DB·P-004 클라우드 중립·P-005 결제 정산 정합성·P-006 테스트·P-007 스펙 범위). 따라서 본 검토는 **spec.md NFR-001(60분 윈도우)·NFR-005(50분 내부 목표)** 를 유일한 판정 기준으로 사용한다.

- P-003(단일 DB 원칙) 은 간접적으로 관련 — 이관 도구가 신규 외부 데이터저장소를 도입하지 않는지 확인: `scripts/migration/` 전체가 표준 `psql`/`\copy`/raw SQL 만 사용, 신규 npm 의존성 0건(research.md 확인) → 위반 없음.
- P-005(결제·정산 정합성) 의 "부동소수점 연산 금지" 는 `10_transform.sql`·`20_verify.sql` 전체가 `NUMERIC(12,2)`/`Decimal` 그대로 비교(캐스팅 없음) → 준수 확인.

---

## 성능 목표

| PERF-ID | NFR-ID | 목표값 | 측정 방법 |
|---|---|---|---|
| PERF-001 | NFR-001 | 유지보수 윈도우(쓰기 차단 시작~트래픽 전환 완료) ≤ 60분 | 리허설(dry-run)/실행 로그 시각차(SC-020, `run.sh do_window_close`) — 옵션A |
| PERF-002 | NFR-005 | FR-005 검증 + GO/NO-GO 판단이 윈도우 개시 후 ≤ 50분 | 리허설 로그(SC-021, `run.sh do_go_nogo` L197-203) — 옵션A |

두 PERF-ID 모두 **실측치는 사용자 환경(레거시 실 DB) 의존**이며, 본 단계에서는 이 실측을 사전에 안전하게 통제하는 **게이트 구조의 완결성**을 판정 대상으로 한다(Test 5b·Deploy·Security 선례와 동일한 "옵션A-정적 갈음" 패턴).

---

## Baseline 측정 결과

| PERF-ID | 측정값 | 목표 달성 여부 |
|---|---|---|
| PERF-001 | 미측정(옵션A, 레거시 실 DB 접근 불가) | N/A — 게이트 구조로 판정 대체 |
| PERF-002 | 미측정(옵션A) | N/A — 게이트 구조로 판정 대체 |

**게이트 구조 판정**(실측 대체):

1. **`PRE-ASSESSMENT.md`**(§1~§4) — 측정 방법(행수 count + 대표 테이블 파일럿 처리량 측정) → 예상소요 산정식(`행수/파일럿 처리량`) → 여유율 산정식(`(50분-누적예상소요)/50분×100%`) → §3 NFR-005 초과 시 FR-012 게이트(사용자 재확인, 완화 옵션 2종: 윈도우 재산정/부분 사전이관) → §4 종합 판정 체크리스트(실측 완료·여유율 확인·리허설 편차 ±20% 재산정 권고) 순서로 완결되어 있다. **누락 없음.**
2. **(C)/(C″) full re-copy 대상 강조** — §2 표가 "소계" 행을 별도로 두어 6개 timestamp-부재 테이블(categories·product_images·variants·inventory·order_items·settlement_items) 및 나머지 (C) 부류(users·products·orders·payments 등)를 60분 예산의 지배 변수로 명시적으로 분리 측정하도록 설계됐다(research.md 발견 §S3 반영). **누락 없음.**
3. **`run.sh` 자체 시간 감시** — `do_go_nogo`(L197-203)가 T0 대비 경과 50분 초과 시 WARN 로그(SC-021 리스크)를, `do_window_close`(L244-253)가 60분 초과 시 WARN 로그(SC-020 재검토)를 실행 시점에 자동 계산·출력한다. 즉 리허설/실행 로그 자체가 게이트 판정 근거를 자동 생성한다.

---

## 병목 지점 분석

| PERF-ID | 병목 원인 | 유형 |
|---|---|---|
| PERF-001/002 관련 F1 | `run.sh do_delta()`/`do_precopy()` 의 `for_each_legacy_service`(L65-78) 가 18개 레거시 서비스(개별 RDS)를 **완전 순차** 처리. `extract.sh` 의 `behavior=FULL|AUX` 부류는 `--mode` 무관하게 매 실행 `delta_filter="TRUE"`(전체 재추출) — research.md 가 지목한 "60분 예산 지배 변수"(C/C″ full re-copy) 가 정확히 이 순차 루프 위에서 실행된다. 각 서비스는 물리적으로 독립된 DB 이므로 자원 경합 없이 병렬화 가능한 구간을 순차로 처리 중. | **구현 수준**(bash 백그라운드화로 해결 가능, 스테이징 ETL 아키텍처 자체는 불변) |
| PERF-002 관련 F2 | `sql/20_verify.sql` §(c) 샘플 체크섬이 `ORDER BY random() LIMIT n` 사용 — PostgreSQL 에서 이 패턴은 **전체 행을 정렬**한 뒤 LIMIT 을 적용하는 anti-pattern(부분 샘플링 의도와 달리 전체 스캔+정렬 비용 발생). 대상 테이블(`products.products`·`orders.orders`·`payments.payments`·`users.users`)이 (C) 대형 후보군과 겹침. | **구현 수준**(SQL 함수 치환으로 해결 가능) |
| (참고) 로드 위상 순서(ADR-005) | `10_transform.sql` 은 단일 `BEGIN...COMMIT` 트랜잭션 내 8개 스키마를 순차 실행하나, research.md 실측 결과 cross-schema 참조가 plain String(FK 미강제)이라 스키마 간 순서가 무결성에 영향을 주지 않음(스키마 **내부** FK 부모-우선만 강제 필요). 다만 이는 하나의 트랜잭션(원자성 보장)이므로 애초에 병렬화 대상이 아니며, staging→target 벌크 SQL 단계는 네트워크 바운드가 아닌 in-DB 연산이라 상대적으로 빠름(research.md S1 설계 의도 — 네트워크 바운드 추출을 윈도우 밖 사전복사로 이동). | 병목 아님(설계 의도대로 동작) — 분석만 수행, 조치 불필요 |

**아키텍처 수준 병목 여부**: 위 F1/F2 모두 스테이징 기반 ETL 아키텍처(ADR-001) 자체의 재설계를 요구하지 않는다(스크립트 내부 실행 방식·SQL 함수 치환 수준). **BLOCKED 판정 없음.**

---

## 최적화 적용 내역

**본 선택 단계는 팀리드 지시(코드 변경 금지 — 검증·보고만)에 따라 코드 최적화를 직접 적용하지 않았다.** F1·F2 는 `gaps.md` GAP-020-08(Medium)·GAP-020-09(Low) 로 비블로킹 권고 기록 후 Retrospective 단계로 위임했다.

| PERF-ID | 권고 내용 | 변경 파일(권고 대상) | 상태 |
|---|---|---|---|
| F1 (GAP-020-08) | `for_each_legacy_service` 호출부에서 서비스별 추출·적재를 백그라운드(`&`+`wait`, 동시성 상한 적용)로 전환 | `scripts/migration/run.sh` | OPEN(비블로킹) |
| F2 (GAP-020-09) | `ORDER BY random() LIMIT n` → `TABLESAMPLE SYSTEM/BERNOULLI` 전환 | `scripts/migration/sql/20_verify.sql` | OPEN(비블로킹) |

---

## 최종 측정 결과

코드 변경 미적용(팀리드 지시)으로 재측정 대상 없음. Baseline 결과(§Baseline 측정 결과)와 동일하게 유지 — 게이트 구조 판정으로 NFR-001/005 구조적 달성을 확인.

---

## 미달성 항목 및 사유

| 항목 | 사유 |
|---|---|
| PERF-001/002 실측치 | 레거시 실 DB 접근이 파이프라인에서 불가(spec.md 명시 전제) — 옵션A(사용자 리허설 실행)로 위임. `test/coverage.md`·`test-report.md` 가 SC-020/021 을 "옵션A-계약검증"으로 이미 정확히 라우팅. |
| F1/F2 코드 최적화 | 팀리드 지시(코드 변경 금지·검증 보고만) — gaps.md GAP-020-08/09 로 비블로킹 기록, Retrospective 위임. |

---

## 회귀 테스트 결과

코드 변경이 없으므로 회귀 테스트 대상 없음. 참고로 Deploy Agent 재검증 시점(2026-07-05 23:04) 기준 정적 테스트 3스위트 54/54 PASS 가 최신 상태로 유지되고 있음을 `pipeline-log.md` 로 확인했다(본 단계에서 재실행 불필요 — 코드 무변경).

---

## 종합 판정

- **gate: PASS**
- NFR-001(60분)·NFR-005(50분) 의 실측 검증은 옵션A(사용자 리허설)로 정확히 위임되어 있으며, 이를 사전에 안전하게 통제하는 `PRE-ASSESSMENT.md` 게이트 구조(측정법→예상소요→여유율→FR-012 초과게이트→종합판정 체크리스트) 가 (C)/(C″) full re-copy 지배 변수를 명시적으로 분리 측정하도록 완결되어 있어 **구조적으로 NFR 달성 가능한 안전장치**로 판정한다.
- 발견된 2건(F1 서비스별 순차 처리·F2 checksum `ORDER BY random()`)은 모두 **구현 수준**(스테이징 ETL 아키텍처 재설계 불요)이며, 아키텍처 수준 성능 결함(필연적 60분 초과 예견 구조)은 발견되지 않았다 → **BLOCKED 사유 없음**.
- F1 은 NFR-001/005 여유율 확보에 가장 레버리지가 큰 항목이므로 GAP-020-08(Medium)로, F2 는 검증 단계(50분 예산 중 5~15분 구간) 국소 영향이라 GAP-020-09(Low)로 각각 비블로킹 기록했다.
- Retrospective 단계 진행 가능.
