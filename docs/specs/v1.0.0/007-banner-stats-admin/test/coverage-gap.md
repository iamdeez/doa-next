---
작성: Test Agent (EXECUTION)
버전: v1.0
최종 수정: 2026-06-29 18:15
상태: 확정 (retroactive)
---

# Coverage Gap: 007-banner-stats-admin

## 목차

- [미커버 항목 목록](#미커버-항목-목록)
- [관리자 audit log 부재 (상세)](#관리자-audit-log-부재-상세)
- [배너 노출기간 in-memory 필터 (상세)](#배너-노출기간-in-memory-필터-상세)
- [판매자 승인 병렬 라우트 (상세)](#판매자-승인-병렬-라우트-상세)
- [신규 단위 테스트 수 기록](#신규-단위-테스트-수-기록)

---

## 미커버 항목 목록

> 모든 spec.md SC(SC-001~011)는 직접 커버(PASS). 아래는 SC 로 정의되지 않았거나 production 기능/정책
> 부재로 테스트 대상이 없는 공백·관찰이다.

| 항목 | 미커버 시나리오 | 카테고리 | 검증 방법 | 담당 | 비고 |
|---|---|---|---|---|---|
| `BannerService.listAll` 직접 단위 테스트 | listAll 위임·정렬 직접 단언 | (1) 단위테스트 가능 | banner.service.spec 에 listAll 위임 단언 추가 | 개발 | FR-004 thin delegation. e2e 라우트 등록(SC-010)으로 간접 확인 |
| `OrderRepository.getSellerCompletedSummary` Decimal 산술 | unitPrice.mul(quantity) 누적 직접 검증 | (1) 단위테스트 가능 | order.repository 집계 직접 테스트 추가 | 개발 | stats.service.spec mock 반환 단언 + order 기존 테스트로 간접 커버 |
| 관리자 액션 audit log | 승인·삭제 등 관리자 조치 추적 | (3) 기능 미구현 | 후속 spec: admin_audit_logs(append-only) + 기록 테스트 | 후속 spec | **013 에서 부분 해결(승인 감사)** — 판매자 승인(SELLER_APPROVE) 감사 도입(GAP-007-01 RESOLVED, 1종 한정). banner CRUD·기타 mutation 감사는 013 GAP-013-01 후속. (원 Low, GAP-007-01) |
| 배너 노출기간 DB where 절 푸시다운 | startsAt/endsAt DB 필터·쿼리 검증 | (3) 기능 미구현 | 배너 수 증가 시 DB 필터 + 쿼리 테스트 | 후속 spec | Low (GAP-007-02) |
| 판매자 승인 라우트 일원화 | seller·admin 병렬 approve 단일화 | (2) 설계 관찰 | 운영 라우트 admin 일원화 정책 spec | 후속 spec | Low (OBS-007-01) |

> 카테고리 (1) 항목이 2건 — listAll·getSellerCompletedSummary 직접 단위 테스트. 둘 다 e2e 부팅·기존
> 도메인 테스트로 간접 확인되며 기능 결함 위험은 낮으나, 직접 단위 검증은 후속 보강 권장.

---

## 관리자 audit log 부재 (상세)

**현상**: admin 모듈이 승인(`approveSeller`)·배너 삭제(`banner.remove`) 등 관리자 조치를 수행하지만,
누가 언제 어떤 조치를 했는지 기록하는 append-only 감사 로그가 없다.

**근본 원인 (코드 근거)**:
- `AdminService` 에 `listPendingSellers`·`approveSeller`·`listUsers` 만 존재하고 감사 기록 메서드·테이블이
  없다. `AdminRepository` 는 빈 클래스(자체 테이블 없음 — ADR-004).
- 관리자 조치가 도메인 Service(`SellerService.approve` 등) 호출로만 수행되어 별도 audit trail 이 남지 않는다.

**위험도**: Low. 보안 사고가 아니라 운영 추적성(거버넌스) 공백. 다수 관리자 운영 시 책임 추적 필요.

**미커버**: audit log production 로직이 없으므로 기록 검증 테스트도 없다(기능 미구현).

**권장 수정 방향 (후속 spec)**:
1. `admin` 스키마에 `admin_audit_logs`(append-only — actorId·action·targetType·targetId·createdAt) 도입.
2. 관리자 조치(승인·삭제 등)에서 감사 기록 + 기록 테스트 추가.

> **013 에서 부분 해결(승인 감사)**: 013-admin-audit-log(커밋 `b8b45aa`)가 `admin` 스키마에 append-only
> `admin_audit_logs`(adminId·action·targetType·targetId·createdAt) 테이블을 도입하고, `AdminRepository`
> 빈 클래스를 실 repository(createAuditLog·listAuditLogs)로 채우며, 판매자 승인(`approveSeller(adminUserId,
> sellerId)`) 시 감사를 기록하고 `GET /admin/audit-logs`(AdminGuard)로 조회한다(`admin.service.spec` 감사
> append·클램프 단위 테스트 +2). **단 감사 대상은 판매자 승인(`SELLER_APPROVE`) 1종이며**, banner CRUD·
> 기타 관리자 mutation 의 감사 기록은 013 GAP-013-01 로 후속 확장에 위임된다(기록 실패 격리 부재는
> GAP-013-02, 조회 HTTP e2e 부재는 GAP-013-03). 본 항목은 gaps.md GAP-007-01(RESOLVED 013)·013-admin-
> audit-log 문서와 동일 사안이다.

---

## 배너 노출기간 in-memory 필터 (상세)

**현상**: `BannerService.listPublic` 이 `repository.listActiveOrdered()`(isActive=true 조회) 후 노출기간
(`startsAt`/`endsAt`)을 `isWithinPeriod` 로 애플리케이션 레벨에서 필터한다. DB where 절에는 노출기간
조건이 없다.

**근본 원인 (코드 근거)**:
- `BannerRepository.listActiveOrdered` 는 `where: { isActive: true }` 만 적용하고 노출기간은 미적용.
- 노출기간 판정이 `BannerService.isWithinPeriod`(in-memory) 에서 수행되어, 활성 배너 전부를 메모리로
  가져온 뒤 필터한다.

**위험도**: Low. 현재 배너 수가 적어 in-memory 필터가 충분하다. 배너 수가 크게 늘면 불필요한 행 로딩이
발생할 수 있다.

**미커버**: DB 푸시다운 production 로직이 없으므로 DB 쿼리 검증 테스트도 없다(현 설계 의도 — ADR-002).

**권장 수정 방향**: 배너 수 증가 시 `listActiveOrdered` 에 `startsAt/endsAt` 범위 조건을 where 절로
푸시다운(now 파라미터화) + `(isActive, startsAt, endsAt)` 인덱스 재검토.

> 본 항목은 gaps.md GAP-007-02 와 동일 사안이다.

---

## 판매자 승인 병렬 라우트 (상세)

**현상**: `SellerService.approve`(PENDING→APPROVED)가 두 경로로 노출된다 —
`PATCH /sellers/:id/approve`(seller 컨트롤러)와 `POST /admin/sellers/:id/approve`(admin 컨트롤러).

**근본 원인 (코드 근거)**:
- `SellerService.approve` 는 007 이전 커밋(`f2f061a`)부터 존재하며 seller 컨트롤러가 호출(기존).
- 007 의 `AdminService.approveSeller` 가 동일 `SellerService.approve` 를 재사용(ADR-005)하여 admin
  컨트롤러에서도 호출 → 라우트 표면이 둘이 되었다(로직 중복 아님).

**위험도**: Low. 두 라우트 모두 `JwtAuthGuard`+`AdminGuard`(fail-closed)로 보호되어 권한 상승 표면은
없다. 운영 일관성(어느 라우트가 정식인지) 차원의 관찰.

**미커버**: 라우트 일원화는 기능 결함이 아니라 정책 결정이므로 SC 로 정의되지 않았다.

**권장 수정 방향**: 운영 라우트를 admin(`POST /admin/sellers/:id/approve`)으로 일원화하고 seller 측
approve 라우트 폐기 여부를 후속 정책 spec 에서 결정.

> 본 항목은 security-report.md OBS-007-01 및 gaps.md 교차 기재와 동일 사안이다.

---

## 신규 단위 테스트 수 기록

007 신규 단위 테스트는 **20건**이며, 실제 spec 파일의 `it()` 를 직접 카운트하여 확정했다(자가 보고
신뢰하지 않음):

| 파일 | 케이스 수 | 구성 |
|---|---|---|
| `banner.service.spec.ts` | 11 | create 1 + update 2 + remove 2 + listPublic 6 |
| `stats.service.spec.ts` | 4 | getOverview 2 + getSellerStats 2 |
| `admin.service.spec.ts` | 5 | listPendingSellers 1 + approveSeller 1 + listUsers 3 |
| **합계** | **20** | 006 baseline 209 + 20 = 229 unit (정합) |

추가로 통합 부팅 `banner-admin.e2e-spec.ts` 8건(배너 공개/권한 5 + 통계 2 + 운영 1), 정적
`cross-schema.spec.ts` 에 BannerRepository(007)·StatsRepository(007)·AdminRepository(007) 규칙 3건,
`auth-required-guards.spec.ts` 에 banner·stats·admin 컨트롤러 검증 대상 3개 경로(기존 단일 it() 내부
목록 확장 — 신규 it() 아님)를 추가했다. 본 카운트는 추적 정확성 목적이며 기능 커버리지에는 영향 없다.
