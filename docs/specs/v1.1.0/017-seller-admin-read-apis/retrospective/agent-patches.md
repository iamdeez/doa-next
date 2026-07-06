---
작성: Retrospective Agent
버전: v1.0
최종 수정: 2026-07-04
상태: 작성중
---

# Agent Patches: 017-seller-admin-read-apis

## 목차

- [전역 Agent 정의 패치](#전역-agent-정의-패치)
  - [PATCH-017-01](#patch-017-01)
- [context.md / infra.md 갱신 패치 (PATCH-CXT)](#contextmd--inframd-갱신-패치-patch-cxt)
  - [PATCH-CXT-001](#patch-cxt-001)
  - [PATCH-CXT-002](#patch-cxt-002)
  - [PATCH-CXT-003](#patch-cxt-003)
  - [PATCH-CXT-004](#patch-cxt-004)

> 본 파일의 모든 패치는 **후보**다. 적용 여부·시점은 main session 이 사용자 승인 후 결정한다(agent-rules.md §12).
> Retrospective Agent 는 context.md/infra.md 를 직접 수정하지 않는다.

---

## 전역 Agent 정의 패치

### PATCH-017-01

**05-test.md (AUTHORING) — §F 마이그레이션 테스트 파일의 선행 spec SC 인용을 출처 정규식 형식으로 선제 작성**

- **대상 파일**: `~/.claude/agents/05-test.md` (Mode: AUTHORING 절)
- **대상 섹션**: AUTHORING 모드 테스트 파일 작성 절차 (§F 응답계약 마이그레이션 테스트 재작성 관련)
- **현재 내용**: AUTHORING 이 기존 테스트 파일을 §F 마이그레이션(응답 계약 변경)으로 재작성할 때, 파일 헤더·`it()` docstring 에 남는 선행 spec 유래 SC 인용 문구의 표기 형식에 대한 명시 지침이 없다. 그 결과 `(002-catalog 계승)`·`(003-commerce 신규)` 등 비정형 형식으로 작성되고, 5b EXECUTION 의 STALE_SC 점검(PATCH-A18 정규식 `\(v\d+\.\d+\.\d+/\d+\s+spec\)`)에 매칭되지 않아 매 차수 STALE_SC 대량 경고 → 사용자 옵션 A 일괄 정정 churn 이 발생한다.
- **변경 내용**: AUTHORING 모드 절차에 다음 [SHOULD] 지침 추가 — "기존 테스트 파일을 §F 마이그레이션으로 재작성하거나 선행 spec 의 SC·테스트 패턴을 계승·인용할 때, 그 출처 표기는 처음부터 PATCH-A18 출처 정규식 `(vX.Y.Z/NNN spec)` 형식으로 작성한다(예: `(002-catalog 계승)` → `(v1.0.0/002 spec) 계승`). 이로써 5b EXECUTION 의 STALE_SC 점검이 정상 spec 이력 인용을 오탐(경고)하지 않으며, 후속 일괄 정정 churn 을 선제 차단한다."
- **변경 근거**: 016·017 **2회 연속** 관찰 — 016 STALE_SC(옵션 A 정정), 017 STALE_SC 27건(6개 파일 17개 위치 옵션 A 일괄 정정, coverage.md §STALE_SC "016 선례 동일"). 반복 검증 충족.
- **적합성**: 범용 O(모든 프로젝트의 SDD 테스트 파일 인용 형식에 적용) / 역할정합 O(05-test.md AUTHORING 의 테스트 파일 작성 절차 범위 내)
- **상태**: 적용 완료 (2026-07-04, main session — `~/.claude/agents/05-test.md`, 변경 로그: `~/.claude/docs-change-logs/2026-07-04-*.md`)

> **참고(4단계 Development 연계)**: §F 마이그레이션 테스트 파일을 Development 가 PPG-1 병렬에서 먼저 손대는 경우(017 실제 사례 — Development 가 A·B·C 완료 시 테스트도 이미 대부분 마이그레이션)도 있으므로, 동일 취지의 인용 형식 지침을 04-development.md 에 부수 반영할지 여부는 main session 판단에 위임한다(본 패치는 STALE_SC 점검 주체인 5a/5b 소관 05-test.md 를 1차 대상으로 한정).

---

## context.md / infra.md 갱신 패치 (PATCH-CXT)

> **infra.md 갱신**: 없음. 017 은 코드만 변경(신규 health check/threshold/재시도정책/외부연동 0건, Docs Agent PATCH-A09 4트리거 해당 없음 자체 판정과 일치). infra.md 패치 미도출.

### PATCH-CXT-001

**context.md §2 — 핵심 도메인 모듈 목록 admin/seller/product/inventory/user 5개 행 갱신**

- **대상 파일**: `/Users/krystal/workspace/doa/doa-next/.claude/docs/context.md`
- **대상 섹션**: §2 프로젝트 구조 → 핵심 도메인 모듈 목록 표
- **변경 내용** (각 행 "역할" 열 additive 보강):
  - **admin 행**: 기존 "운영 — 판매자 승인 대기/승인(SellerService.approve 재사용)·사용자 목록 + 조치 감사 로그(admin_audit_logs, append-only)" → 뒤에 추가: "· 판매자 목록 조회 확장(상태 필터 PENDING/APPROVED/REJECTED·businessName 검색·cursor 페이지네이션, 응답 `{items,nextCursor}` envelope — 017)".
  - **seller 행**: 기존 "판매자 등록·심사·판매자 정보" → 뒤에 추가: "· 신규 공개 `listSellers({status,cursor,take,q})`(admin 모듈 DI 소비)·repository `listByStatusPaginated()` — 017".
  - **product 행**: 기존 "상품/카테고리/옵션/이미지" → 뒤에 추가: "· 판매자 소유 상품 상세 `GET /sellers/me/products/:id`(전 상태 허용, 404→403 assertOwner)·목록 cursor 페이지네이션+envelope 화·공개 요약 `getPublicSummaries(ids)`(user 모듈 DI 제공, ACTIVE/OUT_OF_STOCK 필터) — 017".
  - **inventory 행**: 기존 "재고/입출고 로그/SKU" → 뒤에 추가: "· 재고 조회/입고 응답 `{variantId, stock}` 구조화(getStockView·stockIn 반환형, breaking — 원시 숫자/void 대체) — 017".
  - **user 행**: 기존 "프로필/배송지/찜(wishlist)/최근 본 상품/등급" → 뒤에 추가: "· 위시리스트·최근 본 상품 응답에 상품 요약(title·price·thumbnailUrl) 인라인 조인(`ProductService.getPublicSummaries()` DI, UserModule→ProductModule import)·조회 불가 상품은 `productAvailable:false` 유지 — 017".
- **변경 근거**: GAP-017-02 (Docs Agent 등록, 코드 검증 완료).
- **코드 검증** (PROC-002 — 본 Agent grep 재검증):
  - admin: `admin.controller.ts:37` `listPendingSellers(status?,cursor?,limit?,q?)`, `admin.service.ts:37-48` `listSellers()`→`sellerService.listSellers({status,cursor,take,q})` 위임 확인.
  - seller: `seller.service.ts:125` `listSellers(params)`, `seller.repository.ts:47` `listByStatusPaginated()` 확인.
  - product: `product.controller.ts:68` `getMyProductDetail`, `product.service.ts:268` `getMyProductDetail`·`:293` `getPublicSummaries()` 확인.
  - inventory: `inventory.service.ts:76` `getStockView(variantId): Promise<InventoryStockView>`, `inventory.controller.ts:62` `getStockView` 배선 확인.
  - user: `user.service.ts:207-210` `enrichWithProductSummary` → `productService.getPublicSummaries(...)`, `user.module.ts:12` `imports: [AuthSharedModule, ProductModule]` 확인.
  - **일치 여부**: 전건 코드 사실과 일치 — 갱신 후 텍스트 검증 통과.
- **적합성**: 범용 N/A(프로젝트 문서) / 역할정합 O(context.md §2 코드 수준 현재 상태 — 이력 아님)
- **상태**: 적용 완료 (2026-07-04, main session — 변경 로그: `{project}/.claude/docs-change-logs/2026-07-04-*.md`)

### PATCH-CXT-002

**context.md §1 — 개요 스냅샷 테스트 카운트 정정**

- **대상 파일**: `/Users/krystal/workspace/doa/doa-next/.claude/docs/context.md`
- **대상 섹션**: §1 프로젝트 개요 (개요 스냅샷 blockquote — "단위/통합 테스트" 서술)
- **변경 내용**: 기존 "단위/통합 테스트: unit 255 PASS(25 suites) + e2e/static 84 PASS(16 suites)." → 실측치로 정정: "단위/통합 테스트: unit 366 PASS(36 suites) + static/e2e 대상 스위트 PASS(017 5b 실행 기준)." (§1 "현재 버전"·스냅샷 필드는 이력 테이블이 아닌 현재 상태 스냅샷이므로 갱신 허용 — PROC-R02 금지 대상 아님)
- **변경 근거**: GAP-017-02 부수 권고 — test-report.md/coverage.md 5b 실행 기준 unit 366 PASS(36 suites)가 §1 서술(255/25 suites)과 어긋남.
- **코드 검증** (PROC-002): coverage.md L124 `pnpm exec jest`(unit) "36 suites / 366 tests 전건 PASS", pipeline-log L231 "unit 366/366" 일치. §1 서술 255/25 는 016 이전 값. **일치 여부**: 366/36 이 5b 실측과 일치 — 검증 통과.
- **적합성**: 범용 N/A(프로젝트 문서) / 역할정합 O(§1 현재 상태 스냅샷 — 이력 추가 아님)
- **상태**: 적용 완료 (2026-07-04, main session — 변경 로그: `{project}/.claude/docs-change-logs/2026-07-04-*.md`)

### PATCH-CXT-003

**context.md §6 — cross-schema 고아 참조 제약의 응답 레벨 부분 완화 반영**

- **대상 파일**: `/Users/krystal/workspace/doa/doa-next/.claude/docs/context.md`
- **대상 섹션**: §6 알려진 제약 및 기술 부채 → "cross-schema plain String 참조 (P-001·ADR-001)" 행
- **변경 내용** (해당 행 "내용" 열 additive 보강, 제약 자체는 잔존): 기존 "... 삭제 시 고아 레코드 가능" → 뒤에 추가: " — 위시리스트·최근 본 상품 조회 응답은 `productAvailable:false` 표시로 고아 참조를 **응답 레벨에서 흡수**(017 FR-012·ADR-007, `getPublicSummaries` ACTIVE/OUT_OF_STOCK 필터 미조회 시 항목 유지+표시). 스키마 레벨 참조 무결성 부재 자체는 잔존."
- **변경 근거**: GAP-017-01 (Design Agent 등록). 오류가 아닌 갱신 권고.
- **코드 검증** (PROC-002): `product.repository.ts` `findPublicSummariesByIds` `status: { in: [ACTIVE, OUT_OF_STOCK] }` 필터(performance-report L97), `user.service.ts:207-221` enrich 후 미조회 항목 `productAvailable:false` 유지(coverage.md SC-016/017 PASS), `user-response.dto.ts:7` "조회 불가 상품은 productAvailable" 주석 확인. **일치 여부**: 응답 레벨 흡수·스키마 제약 잔존 서술 모두 코드 사실과 일치.
- **적합성**: 범용 N/A(프로젝트 문서) / 역할정합 O(§6 현재 제약 — 이력 아님, additive)
- **상태**: 적용 완료 (2026-07-04, main session — 변경 로그: `{project}/.claude/docs-change-logs/2026-07-04-*.md`)

### PATCH-CXT-004

**context.md §6 — SEC-017-01 (cursor 페이지네이션 목록 API 개별 @Query DTO 미검증) additive 등재**

- **대상 파일**: `/Users/krystal/workspace/doa/doa-next/.claude/docs/context.md`
- **대상 섹션**: §6 알려진 제약 및 기술 부채 (신규 행 additive)
- **변경 내용**: §6 표에 신규 행 추가 —
  - 항목: "cursor 목록 API @Query 파라미터 DTO 미검증 (SEC-017-01, Low·비블로킹)"
  - 내용: "`admin/sellers/pending`·`sellers/me/products` 등 cursor 페이지네이션 엔드포인트가 `@Query('limit')`/`@Query('cursor')` 개별 추출 후 수동 `parseInt` 하여, 전역 ValidationPipe(class-validator DTO 전용)를 우회. `limit=abc` → `NaN` 이 Math.max/min 클램프 통과 → Prisma `take: NaN` 500 유발 가능. 007-admin(`GET /admin/users`·`/audit-logs`)부터 승계된 공통 패턴(017 신규 회귀 아님). 인증·인가 우회·정보노출 없음. 해소: `ListProductsDto` 패턴의 Query DTO 전환."
  - 영향 범위: "admin·seller·product 목록 컨트롤러 공통"
  - 관련 spec: "017 (발견) / 007 (기원)"
- **변경 근거**: SEC-017-01 (Security Agent 권고 2번 — "Retrospective → context.md §6 등재 권고"), PROC-013-03(위임된 보안 부채의 §6 additive 등재 — 프로젝트 특정 보안 사안은 전역 규칙 아닌 프로젝트 문서에 기록, 다음 spec 설계자 워크플로우 ③ 인지 목적). Low·비블로킹이나 반복 패턴(007→017)이므로 무추적 소실 방지 위해 등재.
- **코드 검증** (PROC-002): security-report.md SEC-017-01 — `admin.controller.ts:37-49`·`product.controller.ts:53-63` `@Query('limit') limit?: string` + `parseInt`, `main.ts:20-26` ValidationPipe 는 DTO 전용. **일치 여부**: Security Agent 소스 직접 Read 근거와 일치.
- **적합성**: 범용 N/A(프로젝트 특정 보안 부채) / 역할정합 O(§6 알려진 제약 — 프로젝트 문서, 전역 규칙 아님)
- **상태**: 적용 완료 (2026-07-04, main session — 변경 로그: `{project}/.claude/docs-change-logs/2026-07-04-*.md`)

> **PROC-R02 준수 확인**: 위 4개 PATCH-CXT 는 모두 정의된 섹션(§1 스냅샷·§2 모듈 표·§6 제약 표)만 갱신하며, "버저닝 이력/changelog" 성 섹션에 신규 행을 추가하지 않는다. §1 은 현재 상태 스냅샷 필드로 이력 테이블이 아니다.
</content>
