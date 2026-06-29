---
작성: Docs Agent
버전: v1.0
최종 수정: 2026-06-29 21:19
상태: 확정 (retroactive)
---

# Diff: 013-admin-audit-log

## 목차

- [커밋 메시지용 한 줄 요약](#커밋-메시지용-한-줄-요약)
- [변경 요약](#변경-요약)
- [변경 파일 및 라인 수](#변경-파일-및-라인-수)
- [Diff](#diff)

## 커밋 메시지용 한 줄 요약

- **KO**: 013 관리자 감사 로그 — admin_audit_logs(append-only) 추가 + 판매자 승인 감사 기록 + GET /admin/audit-logs (GAP-007-01)
- **EN**: 013 admin audit log — add admin_audit_logs (append-only), record on seller approve, GET /admin/audit-logs (GAP-007-01)

## 변경 요약

- **schema — AdminAuditLog 모델(FR-001)**: `admin` 스키마에 append-only `AdminAuditLog`(id·adminId·
  action·targetType·targetId·createdAt) 추가. 인덱스 `(createdAt desc)`·`(adminId, createdAt desc)`.
  adminId/targetId 는 cross-schema plain String(P-001, FK 미선언).
- **migration 013(FR-001·NFR-004)**: `CREATE TABLE "admin"."admin_audit_logs"` + 인덱스 2종. 비파괴
  신규 테이블(migrate dev 적용, 전체 테이블 29→30).
- **admin.repository — 빈 클래스 → 실 repository(FR-002)**: `createAuditLog({ adminId, action,
  targetType, targetId })`(append-only INSERT) + `listAuditLogs(take)`(최신순 take 개). admin 스키마
  자기 소유 테이블만 접근(UPDATE/DELETE 미제공).
- **admin.constants — 감사 상수(FR-003·04)**: `DEFAULT_AUDIT_LOG_LIMIT(50)`·`MAX_AUDIT_LOG_LIMIT(200)`·
  `AUDIT_ACTION = { SELLER_APPROVE }`·`AUDIT_TARGET = { SELLER }`(String 확장성).
- **admin.service — approveSeller 시그니처+감사(FR-003)**: `approveSeller(sellerId)` →
  `approveSeller(adminUserId, sellerId)`(BREAKING — 호출 측 controller 1건 갱신). `sellerService.approve`
  성공 후 `createAuditLog({ adminId: adminUserId, SELLER_APPROVE, SELLER, sellerId })` append.
- **admin.service — listAuditLogs(FR-004)**: `listAuditLogs(limit)` — `min(max(limit ?? 50, 1), 200)`
  클램프 후 `adminRepository.listAuditLogs(take)`.
- **admin.controller — adminUserId 전달·라우트(FR-003·04)**: `POST /admin/sellers/:id/approve` 가
  `@CurrentUser().userId` → `approveSeller`. `GET /admin/audit-logs?limit=` 신규(컨트롤러 레벨
  JwtAuthGuard+AdminGuard 포섭).
- **테스트**: `admin.service.spec` 의 `approveSeller` 단언을 감사 append 포함으로 갱신 + `listAuditLogs`
  describe 2 it()(default 50·max 200 클램프) 신규 + `AdminRepository` mock provider 추가(unit 253→255,
  +2). `cross-schema.spec` AdminRepository 규칙 주석·label(007→007/013) 갱신(신규 it() 0).
- **해결**: GAP-007-01(관리자 audit log 부재, Low) 부분 해결 — 감사 대상 판매자 승인 1종 한정(banner
  CRUD·기타 mutation 은 GAP-013-01 후속 확장).

## 변경 파일 및 라인 수

> 범위: `apps/backend`. base `1af0fa6`(012 정식 SDD 문서 커밋 — 코드는 012 완료 `35791d6` 와 동일) →
> `b8b45aa`(013 완료). `git diff --numstat` 직접 카운트.

| 파일 | 추가 | 삭제 |
|---|---|---|
| `apps/backend/src/modules/admin/admin.service.spec.ts` | +39 | -3 |
| `apps/backend/src/modules/admin/admin.service.ts` | +37 | -6 |
| `apps/backend/src/modules/admin/admin.repository.ts` | +26 | -4 |
| `apps/backend/prisma/schema.prisma` | +20 | -0 |
| `apps/backend/src/modules/admin/admin.controller.ts` | +16 | -3 |
| `apps/backend/prisma/migrations/20260629121613_013_admin_audit_log/migration.sql` (신규) | +17 | -0 |
| `apps/backend/src/modules/admin/admin.constants.ts` | +13 | -0 |
| `apps/backend/test/static/cross-schema.spec.ts` | +3 | -3 |

**합계 (apps/backend)**: 8 files changed, 171 insertions(+), 19 deletions(-).

> 본 013 SDD 문서 세트(`docs/specs/v1.0.0/013-admin-audit-log/**`) 와 `CHANGES.md` 의 013 항목, 그리고
> 007 문서의 GAP-007-01 상태 갱신은 `b8b45aa` 코드 커밋 **이후** retroactive 로 별도 추가되었다(코드
> diff 범위 외).

## Diff

> 전체 diff 는 본 문서에 박제하지 않는다 — **git 이 형상관리 SoT** 이며 전체 캡처는 중복·비효율이다.
> 변경 내용은 위 "변경 요약" · "변경 파일 및 라인 수" 절로 추적하고, 라인 단위 diff 가 필요하면 아래로 재생성한다:
>
> ```bash
> git diff 1af0fa6 b8b45aa -- apps/backend   # base commit: 1af0fa6
> ```
