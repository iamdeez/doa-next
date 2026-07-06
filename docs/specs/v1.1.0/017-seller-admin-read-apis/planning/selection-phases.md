---
작성: Planning Agent
버전: v1.0
최종 수정: 2026-07-03 [시각 미확인, spawn 기준 22:58 — Bash 도구 미제공]
상태: 검토중
---

# selection-phases.md

## 목차

- [선택 단계 활성화 결정](#선택-단계-활성화-결정)
- [신규 PyPI 의존성 자가 점검](#신규-pypi-의존성-자가-점검-patch-a15)

---

## 선택 단계 활성화 결정

선택 단계 활성화 결정(FR/NFR 명시 근거 기준):

- **Database Design Agent: N**
  - 근거: spec.md "범위 외" 에 "신규 Prisma 마이그레이션 없음 — 모든 변경은 기존 테이블·컬럼 범위 내 응답 DTO/조회 로직 확장" 명시. FR/NFR 에 DB 스키마 변경·생성 명시 없음.

- **Deploy Agent: N**
  - 근거: FR/NFR 에 배포 환경 구성·컨테이너화·CI/CD 변경 명시 없음. 신규 PyPI/npm 의존성 추가 없음(TypeScript/NestJS, `package.json` dependencies 무변경). `pyproject.toml`·Dockerfile·docker-compose 구조 변경 없음.

- **Security Agent: Y**
  - 근거: NFR-002(무효/부재 JWT → 401 인증), NFR-003(비관리자 → 403 인가, AdminGuard fail-closed)이 **인증·인가 요구사항을 명시**. FR-005(소유하지 않은 상품 조회 거부 403·IDOR 방어)도 인가 요구. 관리자 판매자 목록은 seller PII(businessNumber·representativeName·contactPhone) 노출 표면. 3축 인가 검증(plan 인터페이스 계약 절)의 최종 감사를 Security Agent 가 수행.

- **Performance Agent: Y**
  - 근거: NFR-001 이 성능 목표 **수치 명시** — "cursor 페이지네이션 목록 조회 API 의 P95 응답 시간은 500ms 이하"(로컬 docker-compose, 1,000건 미만). SC-018 로 검증. Performance Agent 는 신규 조회 경로(seller.status 필터·검색, product.sellerId cursor, getPublicSummaries `in` 쿼리)의 인덱스·N+1 정적 리뷰 + (옵션 A 채택 시) P95 실측 검증.

## 활성화된 단계 실행 순서

Deploy Agent → **Security Agent → Performance Agent** (Deploy 비활성이므로 Security 부터).

- 캐스케이딩 블로킹 규칙(agent-rules.md §0): Security Agent 가 Critical/High 취약점으로 BLOCKED 시 Performance Agent 스킵. Medium 이하만 존재 시 Performance 진행.

## 결정 일시 및 결정자

- 결정 일시: 2026-07-03 [시각 미확인, spawn 기준 22:58]
- 결정자: Planning Agent (02-planning.md 선택 단계 활성화 결정 기준)

---

## 신규 PyPI 의존성 자가 점검 (PATCH-A15)

- 자가 점검: 본 spec 에 신규 PyPI 의존성 추가가 있는가? → **없음** (본 프로젝트는 Python 아닌 TypeScript/NestJS. `package.json` dependencies 무변경, 기존 NestJS·Prisma 스택 승계). 본 항목 무관.
</content>
