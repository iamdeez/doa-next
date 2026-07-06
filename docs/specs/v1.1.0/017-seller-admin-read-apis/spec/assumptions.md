---
작성: Spec Agent
버전: v1.0
최종 수정: 2026-07-03 [spawn 기준 22:44 — Bash 도구 미제공]
상태: 확정
---

# Assumptions: 017-seller-admin-read-apis

> 본 spec은 `docs/backend-gaps.md` + 실코드 재검증을 1차 입력으로 삼았다(spec-input.md "도구 제약 안내" 참조).
> 아래 가정은 대화형 재확인 없이 기존 코드베이스 컨벤션·constitution 원칙과의 일관성을 근거로 채택했으며,
> 근거는 spec-input.md "질문 분석 근거" 절에 상세 기재되어 있다.

| ID | 가정 내용 | 확인 필요 여부 | 확인 방법 |
|---|---|---|---|
| ASM-001 | BE-GAP-003 신규 상세 조회에서 상품이 존재하지만 요청자가 소유자가 아니면 403(Forbidden), 상품 ID 자체가 존재하지 않으면 404(NotFound)를 반환한다 — 기존 `ProductService.assertOwner` 패턴(수정·게시·이미지 등록 등 전 mutation 메서드에서 이미 사용 중)과의 일관성 근거. | 낮음 | Planning/Design 단계에서 기존 `assertOwner` 헬퍼 재사용 여부로 확인 |
| ASM-002 | BE-GAP-002 관리자 판매자 목록 확장은 기존 `GET /admin/sellers/pending`(`AdminController.listPendingSellers`)엔드포인트를 확장하는 방식으로 하며, 별도 신규 엔드포인트를 추가하지 않는다. status 파라미터 미지정 시 기존 동작(PENDING 고정)과 동일하게 하위 호환을 유지한다. | 낮음 | Planning 단계에서 라우트 설계 시 확정 |
| ASM-003 | BE-GAP-005 재고 입고(`POST /inventory/:variantId/stock-in`)도 조회(`GET /inventory/:variantId/stock`)와 동일하게 입고 처리 후 갱신된 `{ variantId, stock }` 객체를 응답으로 반환한다(`docs/backend-gaps.md`의 "고려" 제안 채택). | 중간 — console 클라이언트가 현재 응답 body를 사용하지 않으므로 API 계약 확장은 안전하나, 상태 코드(200) 자체는 변경하지 않음을 Planning 단계에서 재확인 필요 | Planning 단계 인터페이스 계약 절에서 명시 |
| ASM-004 | BE-GAP-006 목록 응답(`{ items, nextCursor }`) 통일 범위는 본 spec에서 신규/변경되는 목록(관리자 판매자 목록, 판매자 상품 목록) 2건에 한정한다. `GET /categories` 등 기존 소형 고정 배열 목록의 전환은 범위 밖이다(constitution P-007 스펙 범위 원칙). | 낮음 | 범위 외 절 참조 |
| ASM-005 | BE-GAP-007 위시리스트/최근 본 상품이 참조하는 상품이 삭제되었거나 조회 불가 상태(DRAFT/INACTIVE 등, ACTIVE·OUT_OF_STOCK 아님)인 경우, 해당 항목은 목록에서 제외하지 않고 유지하되 상품 정보 조회 불가 여부를 나타내는 표시(예: `productAvailable: false`)와 함께 반환한다. 무음 필터링(제외)은 채택하지 않는다 — 사용자가 위시리스트 데이터 유실로 오인할 위험. | 중간 — UX 관점 결정이므로 Planning/Design 단계에서 필드명·표시 형태 확정 시 재검토 여지 있음 | 사용자 최종 확인(main session 경유) |
| ASM-006 | 신규 페이지네이션 목록 API(관리자 판매자 목록, 판매자 상품 목록)의 기본/최대 페이지 크기는 기존 `product.constants.ts`의 `DEFAULT_PAGE_LIMIT`(20)·`MAX_PAGE_LIMIT`(100) 관례를 승계한다(신규 수치 임의 도입 없음). | 낮음 | Planning 단계에서 상수 재사용 또는 모듈별 상수 신설 여부 확정 |

## 도구 제약에 따른 절차적 가정

| ID | 가정 내용 | 근거 |
|---|---:|---|
| ASM-007 | 본 세션은 대화형 `AskUserQuestion` 도구가 제공되지 않아, 카테고리별 질문·재질문을 `docs/backend-gaps.md`(구조화된 1차 입력) + 실코드 재검증으로 대체했다. 이는 `016-naver-state-redirect-hardening`(동일 도구 제약 세션)의 선례와 동일한 처리 패턴이며, main session이 사용자에게 spec.md 채택 결과를 최종 제시·확인하는 절차가 이어진다. | spec-input.md "도구 제약 안내", pipeline-log.md 016 선례 |
