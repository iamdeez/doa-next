---
작성: Design Agent → Security Agent → Docs Agent 누적
버전: v1.0
최종 수정: 2026-06-29 18:15
상태: 확정 (retroactive)
---

# Gaps — 007-banner-stats-admin

> 기획/설계 공백 누적 기록. 3단계 이후 모든 Agent 가 누적.

## 목차

- [GAP-007-01](#gap-007-01)
- [GAP-007-02](#gap-007-02)
- [OBS-007-01](#obs-007-01)

---

## GAP-007-01

- **출처**: Design Agent / Test Agent (coverage-gap) / Security Agent (권고)
- **유형**: 운영 추적 공백 (Low) — 관리자 액션 audit log 미도입
- **컨텍스트**: `admin.service.ts`(listPendingSellers·approveSeller·listUsers), `admin.repository.ts`(빈 클래스), `banner.service.ts`(remove)
- **내용**: admin 도메인이 승인(`approveSeller`)·배너 삭제(`banner.remove`) 등 관리자 조치를 수행하지만, 누가 언제 어떤 조치를 했는지 기록하는 append-only 감사 로그 테이블이 없다. `AdminRepository` 는 자체 테이블이 없는 빈 클래스이며(ADR-004), 관리자 조치가 도메인 Service 호출로만 수행되어 audit trail 이 남지 않는다.
- **수정 방향**: `admin` 스키마에 `admin_audit_logs`(append-only — actorId·action·targetType·targetId·createdAt) 도입 + 관리자 조치 시 감사 기록 + 기록 테스트 추가.
- **영향**: 낮음 — 보안 사고가 아니라 운영 추적성(거버넌스) 공백. 다수 관리자 운영 시 책임 추적 필요.
- **상태**: **RESOLVED (013-admin-audit-log, 커밋 `b8b45aa`) — 범위: 판매자 승인 감사 1종**. `admin` 스키마에 append-only `admin_audit_logs`(adminId·action·targetType·targetId·createdAt) 테이블 추가 + `AdminRepository` 빈 클래스 → 실 repository(createAuditLog·listAuditLogs) + 판매자 승인(`approveSeller(adminUserId, sellerId)`) 시 감사 기록 + `GET /admin/audit-logs`(AdminGuard) 조회. **단, 현재 감사 대상은 판매자 승인(`SELLER_APPROVE`) 1종이며 banner CRUD·기타 관리자 mutation 의 감사 기록은 미적용**(013 GAP-013-01 로 후속 확장 위임 — 각 도메인 `AdminService.recordAudit` 호출 또는 이벤트 구독). 상세: docs/specs/v1.0.0/013-admin-audit-log/.

## GAP-007-02

- **출처**: Design Agent / Test Agent (coverage-gap)
- **유형**: 성능/설계 공백 (Low) — 배너 노출기간 in-memory 필터
- **컨텍스트**: `banner.service.ts` `listPublic`/`isWithinPeriod`, `banner.repository.ts` `listActiveOrdered`
- **내용**: `BannerService.listPublic` 이 `repository.listActiveOrdered()`(isActive=true 조회) 후 노출기간(`startsAt`/`endsAt`)을 `isWithinPeriod`(애플리케이션 레벨)에서 필터한다. DB where 절에는 노출기간 조건이 없어 활성 배너 전부를 메모리로 로딩한 뒤 필터한다(ADR-002 — 현재 배너 수 적어 충분).
- **수정 방향**: 배너 수 증가 시 `listActiveOrdered` 에 `startsAt`/`endsAt` 범위 조건을 where 절로 푸시다운(now 파라미터화) + `(isActive, startsAt, endsAt)` 인덱스 재검토.
- **영향**: 낮음 — 현재 배너 수가 적어 표면 제한적. 본 spec 범위 외.
- **상태**: OPEN — 후속 spec 위임.

## OBS-007-01

- **출처**: Security Agent (설계 관찰) / Design Agent
- **유형**: 설계 관찰 (Low) — 판매자 승인 병렬 라우트
- **컨텍스트**: `seller.controller.ts` `PATCH /sellers/:id/approve`(기존), `admin.controller.ts` `POST /admin/sellers/:id/approve`(007 추가), `seller.service.ts` `approve`(재사용)
- **내용**: 판매자 승인(`SellerService.approve`, PENDING→APPROVED)이 두 라우트로 노출된다 — seller 컨트롤러(`PATCH /sellers/:id/approve`, 007 이전부터 존재)와 admin 컨트롤러(`POST /admin/sellers/:id/approve`, 007 이 동일 `SellerService.approve` 재사용). 로직 중복은 아니나(단일 서비스 메서드 재사용) 라우트 표면이 둘이다.
- **수정 방향**: 운영 라우트를 admin(`POST /admin/sellers/:id/approve`)으로 일원화하고 seller 측 approve 라우트 폐기 여부를 후속 정책 spec 에서 결정.
- **영향**: 낮음 — 두 라우트 모두 `JwtAuthGuard`+`AdminGuard`(fail-closed)로 보호되어 권한 상승 표면 없음. 운영 일관성(정식 라우트 모호) 차원의 관찰. 보안 노출 없음. OWASP A04.
- **상태**: OPEN — security-report.md OBS-007-01 과 동일 사안. 후속 정책 spec 위임.
