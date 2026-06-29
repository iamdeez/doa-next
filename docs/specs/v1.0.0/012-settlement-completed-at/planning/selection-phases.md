---
작성: Planning Agent
버전: v1.0
최종 수정: 2026-06-29 21:01
상태: 확정 (retroactive)
---

# selection-phases.md

## 목차

- [선택 단계 활성화 결정](#선택-단계-활성화-결정)
- [신규 PyPI/npm 의존성 자가 점검](#신규-pypinpm-의존성-자가-점검)
- [활성화된 단계 실행 순서](#활성화된-단계-실행-순서)
- [security 폴더 생략 사유](#security-폴더-생략-사유)
- [결정 일시 및 결정자](#결정-일시-및-결정자)

## 선택 단계 활성화 결정

> 활성화 기준: spec.md FR/NFR 에 **명시적 요구사항**이 존재할 때만 활성화(암묵적 연관 금지).

- **Database Design Agent**: **Y**
  - 근거: `Order.completedAt DateTime?` 컬럼 1종 추가 + 비파괴 마이그레이션 012(`ADD COLUMN "completedAt"
    TIMESTAMP(3)`) 생성. FR-001 이 DB 스키마 변경(컬럼 추가)·마이그레이션 파일을 직접 요구한다. Database
    Design Agent 가 컬럼 정의·마이그레이션 SQL·비파괴성·롤백 전략을 확정한다.

- **Deploy Agent**: **N**
  - 근거: FR/NFR 에 배포 환경 구성·컨테이너화·CI/CD 변경 명시 없음. 신규 npm 의존성 0건, Dockerfile/
    docker-compose·env 변경 0. 마이그레이션은 기존 `prisma migrate` 절차로 적용(005~011 과 동일 운영).

- **Security Agent**: **N**
  - 근거: 본 spec 은 정산 집계 기간 필터의 *기준 시각* 정밀화(createdAt → completedAt)이며, 인증·인가·
    입력 검증·접근 제어 표면을 변경하지 않는다. `completedAt` 은 서버가 전이 시점에 기록하는 시각이며
    클라이언트 입력이 아니다(IDOR·인젝션·권한 우회 표면 부재). 정산 권한·소유권 검증은 005/008 의 기존
    경로 불변. OWASP Top 10 관점의 신규 공격 표면이 없어 보안 감사 대상 부재.

- **Performance Agent**: **N**
  - 근거: NFR 에 성능 목표 수치(P95·처리량) 명시 없음. 필터 기준 컬럼 전환(`createdAt` → `completedAt`)은
    동일 구조의 범위 조건이며 알고리즘 복잡도 변화 없음. `completedAt` 인덱스 추가는 범위 외(현재 데이터
    량에서 불필요).

## 신규 PyPI/npm 의존성 자가 점검

```
자가 점검: 본 spec 에 신규 의존성 추가가 있는가? (package.json dependencies 변경)
  → 없음. 신규 npm 패키지 0건. 기존 Prisma·@prisma/client(OrderStatus·Prisma)만 사용.
  → 본 항목 무관. (Deploy Agent 비활성)
```

## 활성화된 단계 실행 순서

- Database Design Agent: 3단계(Design) 후 / 4단계(Development) 전 (`Order.completedAt` 컬럼·마이그레이션
  012 확정)

> 캐스케이딩 블로킹: Deploy·Security·Performance 전부 비활성. Database Design Agent 단독 활성(컬럼·
> 마이그레이션 산출) 후 4단계 진입.

## security 폴더 생략 사유

본 spec 폴더에는 `security/` 디렉토리를 생성하지 않는다. Security Agent: N(위 결정 근거 참조 — 정산
기준 시각 정밀화는 인증·인가·입력 검증·접근 제어 표면을 변경하지 않으며, `completedAt` 은 클라이언트
입력이 아닌 서버 기록 시각이라 신규 공격 표면이 없다). 보안 영향 분석은 본 selection-phases.md 의
Security Agent 결정 근거로 갈음한다.

## 결정 일시 및 결정자

- 결정 일시: 2026-06-29 21:01
- 결정자: Planning Agent (2단계, retroactive)
