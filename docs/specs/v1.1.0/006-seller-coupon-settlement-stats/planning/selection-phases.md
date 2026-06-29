---
작성: Planning Agent
버전: v1.0
최종 수정: 2026-06-30 01:41
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

- **Database Design Agent**: **N**
  - 근거: DB 스키마 변경 0(마이그레이션 없음). 신규 테이블·컬럼·enum·인덱스·제약 0건. 본 차수는 프론트
    console 화면 + 공유 패키지 변경이며 백엔드 DB·도메인 모듈과 무관하다. 화면이 소비하는 통계·정산·쿠폰
    "데이터"는 백엔드 HTTP 응답을 표현하는 전이형 view 타입(`@doa/shared-types`)이며 신규 영속 저장소가
    아니다. 다이얼로그 폼의 `useState` 는 컴포넌트 세션 메모리다.

- **Deploy Agent**: **N**
  - 근거: FR/NFR 에 배포 환경 구성·컨테이너화·CI/CD 변경 명시 없음. `Dockerfile`·`docker-compose`·`env`
    변경 0. 신규 의존성 0(`package.json` 변경 없음). 신규 라우트 3개는 기존 console Next.js 빌드에 포함되어
    별도 배포 토폴로지·환경변수 변경이 없다.

- **Security Agent**: **N**
  - 근거: 본 차수는 클라이언트 화면이며 실제 인가는 백엔드가 강제한다(판매자 스코프 라우트·APPROVED 판매자
    검증). UI 의 `isSeller` 분기는 표시 편의일 뿐 데이터 보호가 아니며, 비판매자 직접 접근 시 백엔드가
    차단한다. 쿠폰 생성 폼의 클라이언트 검증(discountValue>0·PERCENTAGE 1~100)은 UX 즉시 피드백이고 실제
    강제는 백엔드 010 서버 검증(class-validator)이 담당한다. 화면은 금전·정산 상태를 변경하지 않고 Decimal
    문자열을 부동소수점 연산 없이 표시만 한다(`formatKRW` — P-005). 신규 의존성·신규 네트워크 엔드포인트
    0(기존 백엔드 라우트 소비). OWASP Top 10 관점의 신규 공격 표면 부재(plan.md §보안 노트로 갈음).

- **Performance Agent**: **N**
  - 근거: NFR 에 성능 목표 수치(P95·처리량) 명시 없음. 본 차수는 UI 화면(TanStack Query 페칭·Table/StatCard
    렌더)이며 알고리즘·핫패스·쿼리 변경 0. 통계는 요약 2개 지표, 정산은 전체 배열, 쿠폰은 첫 페이지(cursor
    더보기 미구현 — 범위 외)를 렌더하며 판매자 본인 규모로 Phase 2 표시에 충분하다. 런타임 오버헤드를
    추가하는 신규 의존성 0. 토큰 통일은 클래스명 교체로 런타임 비용 변화 없음.

## 신규 PyPI/npm 의존성 자가 점검

```
자가 점검: 본 spec 에 신규 의존성 추가가 있는가? (package.json dependencies 변경)
  → 없음. `git diff --numstat 4daca5a 1a6d70d` 변경 파일 15종에 `package.json` 부재.
  → 기존 패키지(@tanstack/react-query·@doa/ui[Radix Dialog 포함]·@doa/api-client·@doa/shared-types·
    @doa/design-tokens)만 사용.
  → P-002(AWS 의존 금지) 무저촉(신규 의존 0). Deploy Agent 활성 불요(배포 영향 없음).
```

## 활성화된 단계 실행 순서

- 활성 선택 단계 **없음**(Database Design·Deploy·Security·Performance 전부 N).
- 필수 단계만 진행: Design(3) → Development(4) + Test AUTHORING(5a, PPG-1 병렬) → Test EXECUTION(5b) →
  Docs(6) → Retrospective(7).

> 캐스케이딩 블로킹: 선택 단계 전무로 해당 없음. Design 산출(research·tasks) 후 PPG-1 진입.

## security 폴더 생략 사유

본 spec 폴더에는 `security/` 디렉토리를 생성하지 않는다. Security Agent: N(위 결정 근거 참조 — 본 차수는
클라이언트 화면이며 인가는 백엔드 강제, UI 는 표시 분기, 쿠폰 검증은 010 서버 검증 정합, 금전은 표시 전용·
부동소수점 미연산, 신규 의존·신규 엔드포인트 0). 보안 영향 분석은 본 selection-phases.md 의 Security Agent
결정 근거 + plan.md §보안 노트(권한 강제·쿠폰 검증 이중 방어·금전 정합성·신규 공격 표면·OWASP 결론)로
갈음한다. 003·004 가 security 폴더를 생략한 것과 동일 패턴이다.

## 결정 일시 및 결정자

- 결정 일시: 2026-06-30 01:41
- 결정자: Planning Agent (2단계, retroactive)
