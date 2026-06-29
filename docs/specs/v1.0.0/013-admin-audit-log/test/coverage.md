---
작성: Test Agent (EXECUTION)
버전: v1.0
최종 수정: 2026-06-29 21:19
상태: 확정 (retroactive)
---

# Coverage: 013-admin-audit-log

## 목차

- [실행 요약](#실행-요약)
- [SC × 시나리오 커버리지 매트릭스](#sc--시나리오-커버리지-매트릭스)
- [커버리지 요약](#커버리지-요약)
- [STALE_SC 경고](#stale_sc-경고)

---

## 실행 요약

> 본 retroactive 검증은 013 완료 커밋 `b8b45aa`(base `1af0fa6`) 기준으로 main session 이 게이트를 직접
> 재실행·코드리뷰하여 확인한 수치다. 013 신규 단위 테스트는 +2건(`admin.service.spec` 의 `listAuditLogs`
> describe 2 it()), `approveSeller` 테스트는 감사 append 단언 포함으로 갱신(it 명 변경)이며, unit 합계는
> 012 의 253 에서 255 로 증가한다.

| 항목 | 본 retroactive 검증 (HEAD `b8b45aa`) |
|---|---|
| tsc `--noEmit` | **EXIT 0** |
| Unit 테스트 (src/) | **25 suites / 255 PASS** (012 대비 +2 — listAuditLogs 클램프 2건) |
| e2e + Static 테스트 (test/) | **16 suites / 84 PASS** (cross-schema 규칙 주석·label 갱신, 신규 it() 0 — 변화 없음) |
| 013 신규 단위 테스트 | **2** (`admin.service.spec` listAuditLogs default·max 클램프) |
| 013 회귀 | **0** (007~012 전체 PASS — approveSeller 갱신 단언도 PASS) |
| 마이그레이션 | **013** (`CREATE TABLE admin.admin_audit_logs` + 인덱스 2 — 비파괴 신규 테이블, migrate dev 적용) |
| 전체 테이블 | **29 → 30** |

> **신규 단위 +2 산정 근거(사실 기준 — 직접 카운트)**:
> - `admin.service.spec.ts` 의 012(`1af0fa6`)→013(`b8b45aa`) diff: 기존 `approveSeller` 테스트 1건을
>   감사 append 단언 포함으로 갱신(it 명 `..._and_records_audit`, +adminUserId 인자) + `listAuditLogs`
>   describe 신규(it 2건 — default 50·max 200 클램프). `AdminRepository` mock provider 추가.
> - admin.service.spec it() 5→7(+2). src 전체 253→255(+2). e2e+static 16/84 불변(cross-schema 는
>   기존 규칙 테이블 항목의 주석·label 갱신 — 신규 it() 0).

### 실행 커맨드

```bash
cd apps/backend
npx tsc --noEmit -p tsconfig.json                                              # EXIT 0
npx jest --testPathPattern="src/"                                              # 25 suites / 255 PASS
npx jest --config ./test/jest-e2e.json                                         # 16 suites / 84 PASS
```

---

## SC × 시나리오 커버리지 매트릭스

| SC-ID | 수용 기준 | 케이스 | 상태 |
|---|---|---|---|
| SC-001 | approveSeller 시 감사 append | admin.service.spec.ts::approveSeller (갱신) | PASS |
| SC-002 | listAuditLogs limit 클램프 | admin.service.spec.ts::listAuditLogs (신규 2 it()) | PASS |
| SC-003 | audit-logs 라우트 가드 | (정적) admin.controller.ts `@UseGuards(JwtAuthGuard, AdminGuard)` | VERIFIED(static) |
| SC-004 | 테이블·인덱스·모듈 경계 | (정적) schema·migration·cross-schema AdminRepository 규칙 | VERIFIED(static) |

---

## 커버리지 요약

| 항목 | 수 |
|---|---|
| 전체 SC | 4 (감사 append 1 + 조회 클램프 1 + 라우트 가드 1 + 테이블·경계 1) |
| PASS (단위 직접 커버) | 2 (SC-001·002) |
| VERIFIED (정적 검증) | 2 (SC-003·004 — 코드/스키마/cross-schema 리뷰) |
| GAP | 0 (단, GET /admin/audit-logs HTTP e2e 부재·감사 대상 1종 한정·기록 실패 격리 부재는 coverage-gap.md·gaps.md 참조) |

> SC-001·002 는 단위 테스트로 직접 PASS, SC-003·004 는 정적 코드/스키마/cross-schema 검증으로 확인.
> 감사 로그 조회의 HTTP end-to-end 통합 테스트는 부재하며(가드 정적·기록/클램프 단위로 갈음), 감사 대상은
> 판매자 승인 1종 한정, 기록 실패 격리는 미적용이다(GAP-013-01·02·03, Low — 후속 권고). 013 은 007 의
> GAP-007-01 을 판매자 승인 감사 범위에서 RESOLVED 처리한다.

---

## STALE_SC 경고

STALE_SC 검출 결과: **0건**

검출 대상: 013 git diff(`git diff 1af0fa6 b8b45aa -- apps/backend`) 변경 파일 내 테스트 SC 번호.
`admin.service.spec.ts` 의 갱신/신규 단언은 주석 `// 013: 승인 후 감사 로그 append` 등 라벨과 행위 기반
테스트명(`when_called_then_reuses_seller_approve_and_records_audit`·`when_limit_*`)을 사용한다(spec.md
SC 와의 매핑은 본 coverage.md·test-cases.md 가 담당). semantic mismatch 없음.
