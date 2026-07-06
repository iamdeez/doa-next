---
작성: Docs Agent
버전: v1.0
최종 수정: 2026-07-05 18:30
상태: 확정
---

# Diff: 019-security-quality-followups

## 커밋 메시지용 한 줄 요약

- **KO**: 관리자·판매자 목록 API 쿼리 DTO 검증·인덱스 추가·find-email 감사로그·pino redact 보안/품질 후속 조치 + Prisma tx delegate 유실·GET 목록 rate-limit 회귀 사전 결함 2건 통합 수정
- **EN**: Add query DTO validation, list indexes, find-email audit logging, and pino redact follow-ups; also fix two pre-existing defects (Prisma tx delegate loss, GET-list rate-limit regression) surfaced during verification

## 변경 요약

- **DTO 검증 전환(FR-001~005)**: `admin.controller.ts`(`listPendingSellers`·`listUsers`·
  `listAuditLogs`)·`product.controller.ts`(`listMyProducts`)의 개별 `@Query()` + 수동
  `parseInt` 를 신규 공유 `ListQueryDto`/`AdminSellerListQueryDto`(class-validator)로 전환.
  `limit=abc` 등 비정수 입력이 500(NaN passthrough) 대신 400 을 반환.
- **인덱스 추가(FR-006/007)**: `Product.sellerId`·`Seller.status` 선두 복합 인덱스 신규(마이그
  레이션 `20260705162400_add_product_seller_list_indexes`, Database Design Agent 산출).
- **find-email enumeration 감사 로그(FR-008~010)**: `SecurityAuditLogger.findEmailNotFound`
  신규(마스킹+best-effort) — `AuthService.findEmail` 404 분기에 배선.
- **pino redact(FR-011/012)**: `app.module.ts` `LoggerModule` 에
  `redact: ['req.headers.authorization', 'req.headers.cookie']` 추가.
- **사전 결함 통합 fix(트랙 5, 사용자 승인 옵션 A)**:
  - `PrismaService.tx` getter 가 Prisma 6.19.3 클라이언트 생성자 Proxy 로 인해 비-트랜잭션
    경로에서 model delegate 를 상실하던 결함(003-commerce 기원, GAP-019-03 P0) — `rootClient`
    필드 + `registerRootClient` 자기참조 주입(`prisma.module.ts` useFactory)으로 해소. getter
    시그니처·반환형·트랜잭션 내부 경로·14개 repository 호출부 불변.
  - 018 전역 rate limit(20/60s)이 GET 목록/조회 라우트에 예외 없이 적용되어 100회 순차요청
    perf e2e 가 구조적으로 429 를 받던 회귀(GAP-019-04 Medium) — GET 읽기/목록 8핸들러에
    메서드 레벨 `@SkipThrottle()` 부착으로 해소. mutating/auth rate limit(NFR-001~006) 불변.
- **known-limitation(GAP-019-05, Low, 문서화 후 완료)**: `test/auth.e2e-spec.ts::SC-027`·
  `test/auth-recovery.e2e-spec.ts::SC-017` 은 rate-limit quota 산술 충돌로 전체 스위트
  `--runInBand` 실행 시 상시 FAIL(production 정상, 019 비원인, 회귀 아님). 해소는 테스트
  하네스 재설계이며 본 spec 범위 밖 — CHANGES.md 참조.

## 변경 파일 및 라인 수

| 파일 | 추가 | 삭제 |
|---|---|---|
| `apps/backend/prisma/schema.prisma` | +4 | -0 |
| `apps/backend/src/app.module.ts` | +1 | -0 |
| `apps/backend/src/modules/admin/admin.controller.spec.ts` | +34 | -13 |
| `apps/backend/src/modules/admin/admin.controller.ts` | +37 | -22 |
| `apps/backend/src/modules/auth/auth.service.spec.ts` | +88 | -3 |
| `apps/backend/src/modules/auth/auth.service.ts` | +1 | -0 |
| `apps/backend/src/modules/product/product.controller.ts` | +14 | -6 |
| `apps/backend/src/shared/prisma/prisma.module.ts` | +11 | -1 |
| `apps/backend/src/shared/prisma/prisma.service.ts` | +17 | -2 |
| `apps/backend/src/shared/security/security-audit.logger.spec.ts` | +49 | -0 |
| `apps/backend/src/shared/security/security-audit.logger.ts` | +12 | -0 |
| `apps/backend/src/shared/dto/list-query.dto.ts` (신규) | +16 | -0 |
| `apps/backend/src/modules/admin/dto/admin-seller-list-query.dto.ts` (신규) | +17 | -0 |
| `apps/backend/src/shared/prisma/prisma.service.spec.ts` (신규) | +88 | -0 |
| `apps/backend/test/list-query-dto.e2e-spec.ts` (신규) | +243 | -0 |
| `apps/backend/test/pino-redact.e2e-spec.ts` (신규) | +131 | -0 |
| `apps/backend/test/static/list-index.spec.ts` (신규) | +65 | -0 |
| `apps/backend/prisma/migrations/20260705162400_add_product_seller_list_indexes/migration.sql` (신규) | +7 | -0 |
| `apps/backend/prisma/migrations/20260705162400_add_product_seller_list_indexes/rollback.sql` (신규) | +5 | -0 |

> tracked 파일 11개 합계: `git diff 62d14f9 --stat` 기준 +224/-44. 신규(untracked) 파일 8개
> 합계 +572. 전체 22개 파일(수정 11 + 신규 8 + spec 문서 폴더 별도) 변경.

## Diff

> 전체 diff 는 박제하지 않는다 — git 이 형상관리 SoT. 재생성 명령:
> `git diff 62d14f9 -- apps/backend/prisma/schema.prisma apps/backend/src apps/backend/test`
> (신규 untracked 파일은 `git diff --no-index /dev/null {파일}` 또는 `git add -N` 후 재실행)
