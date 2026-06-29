---
작성: Test Agent (EXECUTION)
버전: v1.0
최종 수정: 2026-06-29 21:19
상태: 확정 (retroactive)
---

# Coverage Gap: 013-admin-audit-log

## 목차

- [미커버 항목 목록](#미커버-항목-목록)
- [GET /admin/audit-logs HTTP e2e 부재 (상세)](#get-adminaudit-logs-http-e2e-부재-상세)
- [감사 대상 1종 한정 (상세)](#감사-대상-1종-한정-상세)
- [감사 기록 실패 격리 부재 (상세)](#감사-기록-실패-격리-부재-상세)
- [신규 단위 테스트 수 기록](#신규-단위-테스트-수-기록)

---

## 미커버 항목 목록

> spec.md SC 중 SC-001·002 는 단위 테스트로 직접 커버(PASS), SC-003·004 는 정적 코드/스키마/cross-schema
> 검증으로 확인(VERIFIED). 아래는 직접 자동 단언이 없거나 production 기능/정책 부재로 검증 대상이 없는 항목이다.

| 항목 | 미커버 시나리오 | 카테고리 | 검증 방법 | 담당 | 비고 |
|---|---|---|---|---|---|
| `GET /admin/audit-logs` HTTP e2e | 관리자 200·비인증 401·비관리자 403 end-to-end | (2) 설계(통합 한계) | 관리자/비인증/비관리자 HTTP 시나리오 e2e | 후속 spec | 가드 정적(SC-003)·기록/클램프 단위(SC-001·002)로 갈음(GAP-013-03) |
| 판매자 승인 외 mutation 감사 | banner CRUD·기타 관리자 mutation 감사 기록 | (3) 기능 미구현(범위 외) | 후속 spec: 각 도메인 recordAudit 또는 이벤트 구독 + 기록 테스트 | 후속 spec | Low — 감사 대상 1종(SELLER_APPROVE) 한정(GAP-013-01) |
| 감사 기록 실패 격리/원자성 | createAuditLog 실패 시 흡수/전파 동작 | (2) 설계(한계) | 격리/트랜잭션 정책 확정 후 실패 시나리오 테스트 | 후속 spec | Low — 현재 try/catch·tx 미적용, 예외 전파(GAP-013-02) |
| `AdminRepository` create/list 직접 단위 | 메서드 위임·정렬·take 직접 단언 | (1) 단위테스트 가능 | admin.repository 직접 테스트(Prisma mock) | 개발 | service.spec mock 단언 + 정적으로 간접 확인. 직접 단위 보강 권장 |

---

## GET /admin/audit-logs HTTP e2e 부재 (상세)

**현상**: `GET /admin/audit-logs`(FR-004) 라우트의 관리자 200·비인증 401·비관리자 403 을 HTTP
end-to-end 로 검증하는 통합 테스트가 없다.

**근본 원인 (테스트 토폴로지)**:
- 013 의 테스트는 `admin.service.spec`(단위)와 `cross-schema.spec`(정적)에 집중되어 있다. 컨트롤러 가드
  (`@UseGuards(JwtAuthGuard, AdminGuard)`)는 정적 코드 검증(SC-003)으로 확인되나, 실제 HTTP 요청에 대한
  401/403/200 응답은 e2e 부팅 테스트가 없어 직접 단언되지 않는다.
- 007 의 `banner-admin.e2e-spec.ts` 가 관리자 엔드포인트 가드(SC-010, 401/403)를 e2e 로 검증했으나
  `audit-logs` 라우트는 013 추가분이라 그 e2e 에 포함되지 않았다.

**위험도**: 낮음. 가드가 컨트롤러 레벨(007 기존 검증된 `AdminController`)에 적용되어 새 라우트가 동일
가드에 자동 포섭되므로(라우트별 가드 누락 표면 없음), 정적 확인으로 충분하다. 기록·클램프는 단위로 직접
보장된다.

**권장 수정 방향**: `audit-logs` 라우트를 관리자(200)·비인증(401)·비관리자(403) 시나리오로 검증하는 e2e
추가(GAP-013-03).

---

## 감사 대상 1종 한정 (상세)

**현상**: 013 의 감사 기록은 판매자 승인(`AdminService.approveSeller` → `SELLER_APPROVE`) 1경로뿐이다.
banner CRUD(생성·수정·삭제)·기타 관리자 mutation 은 감사되지 않는다.

**근본 원인 (설계 결정 — ADR-003)**:
- 007 GAP-007-01 의 대표 사례인 판매자 승인부터 감사한다. 다른 도메인 mutation 에 감사 기록을 심으려면
  각 도메인에서 `AdminService.recordAudit` 를 호출하거나 도메인 이벤트를 구독해야 하는데, 이는 결합·범위
  결정이 필요하여 본 차수에서는 판매자 승인 1종으로 한정했다.

**위험도**: 낮음(부분 해결). 007 GAP 의 대표 조치(판매자 승인)는 감사되며, `action`·`targetType` String
설계로 확장 시 마이그레이션이 불필요하다.

**권장 수정 방향**: 후속 spec 에서 (a) 각 도메인 mutation 에서 `AdminService.recordAudit(...)` 호출 또는
(b) 도메인 이벤트(`banner.deleted` 등) 구독 핸들러(009 NotificationEventsHandler 동형)에서 감사 기록 +
기록 테스트 추가(GAP-013-01).

---

## 감사 기록 실패 격리 부재 (상세)

**현상**: `approveSeller` 는 `sellerService.approve(sellerId)` → `adminRepository.createAuditLog(...)` 를
순차 await 하며 단일 `$transaction` 으로 묶거나 try/catch 로 감싸지 않는다.

**근본 원인 (코드 근거 — ADR-004)**:
- 감사는 승인 성공 후 append 되므로 기록 실패가 이미 커밋된 승인을 롤백하지 않는다(기록 순서).
- 그러나 try/catch 가 없어 `createAuditLog` 가 throw 하면 그 예외가 호출 측(controller → 500)으로
  전파된다. 승인은 성공했으나 요청은 오류로 표면화되는 경계가 존재한다(원자성 아님).

**위험도**: 낮음. 정상 경로(감사 INSERT 성공)에서는 문제가 없으며, 감사 INSERT 실패는 드물다(append-only
단일 테이블 INSERT). 다만 "감사 실패 시 승인을 유지할 것인가/요청을 실패시킬 것인가"는 정책 결정이다.

**권장 수정 방향**: 후속에 (a) try/catch 로 감사 실패를 흡수(로깅 후 승인 성공 반환 — 009 safeNotify
동형) 또는 (b) 단일 `$transaction` 으로 승인+감사 원자화. 어느 쪽이든 실패 시나리오 단위 테스트 추가
(GAP-013-02).

---

## 신규 단위 테스트 수 기록

013 신규 단위 테스트는 **2건**이며, 실제 spec 파일 diff 를 직접 확인하여 확정했다(자가 보고 신뢰하지 않음):

| 파일 | 013 변경 | 신규 it() |
|---|---|---|
| `admin.service.spec.ts` | 기존 `approveSeller` 단언 갱신(+adminUserId 인자·감사 append 단언, it 명 `..._and_records_audit`) + `listAuditLogs` describe 신규(default 50·max 200 클램프) + `AdminRepository` mock provider 추가 | **2** (listAuditLogs 2 it()) |
| `test/static/cross-schema.spec.ts` | AdminRepository 규칙 주석·label(007→007/013) 갱신 | **0** (기존 규칙 테이블 항목 갱신) |
| **합계** | — | **2** (012 baseline 253 + 2 = 255 unit, 정합) |

> `admin.service.spec.ts` 의 `approveSeller` 테스트는 신규 it() 이 아니라 기존 테스트를 감사 append
> 단언 포함으로 갱신한 것이다(it 명 변경 — SC-001 커버). 신규 it() 은 `listAuditLogs` describe 의 2건
> (SC-002 클램프)뿐이다. unit 합계 253→255(+2), e2e+static 16/84 불변. 본 카운트는 추적 정확성 목적이다.
