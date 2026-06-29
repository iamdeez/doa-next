---
작성: Planning Agent
버전: v1.0
최종 수정: 2026-06-30 00:40
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
    HTTP 클라이언트 패키지 변경이며 백엔드 DB·도메인 모듈과 무관하다. client 가 소비하는 "데이터"는 런타임
    DB 데이터가 아닌 HTTP 계약 타입(생성 타입 `paths` — 001 산출)이다. `TokenStore` 는 저장 전략 위임
    인터페이스로 신규 저장소가 아니다.

- **Deploy Agent**: **N**
  - 근거: FR/NFR 에 배포 환경 구성·컨테이너화·CI/CD 변경 명시 없음. `Dockerfile`·`docker-compose`·`env`
    변경 0. 신규 의존(`openapi-fetch`)은 프론트 번들 라이브러리로 런타임 배포 토폴로지·환경변수에 영향
    없다(`baseUrl` 은 기존 console 주입 방식 유지).

- **Security Agent**: **N**
  - 근거: 본 차수는 기존 401 refresh·Bearer 토큰 주입 로직을 `HttpClient` 에서 `createAuthFetch` 로
    **추출·일원화** 한 것이며 인증 메커니즘을 변경하지 않는다(토큰 처리는 기존 유지·강화). facade·client 가
    단일 refresh 인스턴스를 공유하여 토큰 갱신 일관성이 강화된다(refresh 중복·경합 제거). 실제 토큰 저장은
    `TokenStore` 로 console 에 위임(api-client 영속 저장 0). 익명 요청(`doaAnonymous`)은 Authorization 미주입
    분리. openapi-fetch 는 표준 fetch 래퍼로 새 네트워크 엔드포인트·입력 처리 경로를 추가하지 않는다. OWASP
    Top 10 관점의 신규 공격 표면 부재(plan.md §보안 노트로 갈음).

- **Performance Agent**: **N**
  - 근거: NFR 에 성능 목표 수치(P95·처리량) 명시 없음. 본 차수는 HTTP 전송 계층 리팩토링(refresh 추출·
    타입드 client 추가)이며 알고리즘·핫패스·쿼리 변경 0. 오히려 refresh 중복 제거(in-flight 1회)로 불필요
    refresh 호출이 감소한다. 타입드 client 는 빌드 타임 타입 체크일 뿐 런타임 오버헤드를 추가하지 않는다
    (openapi-fetch 는 경량 fetch 래퍼).

## 신규 PyPI/npm 의존성 자가 점검

```
자가 점검: 본 spec 에 신규 의존성 추가가 있는가? (package.json dependencies 변경)
  → 있음. 1건:
     - openapi-fetch ^0.17.0   (packages/api-client dependency — 생성 타입 paths 소비 타입드 HTTP 클라이언트)
  → AWS/Fly.io 전용 SDK 아님(P-002 무저촉, NFR-005). 표준 타입드 fetch 래퍼 라이브러리이며 런타임 배포
    구성·환경변수 변경 0. Deploy Agent 활성 불요(배포 영향 없음). plan.md Constitution Gates P-002 에 도입
    정당화 기록. pnpm-lock.yaml 에 `openapi-fetch@0.17.0` 추가 확인(부수 변경 — spec 코드 범위 외).
```

## 활성화된 단계 실행 순서

- 활성 선택 단계 **없음**(Database Design·Deploy·Security·Performance 전부 N).
- 필수 단계만 진행: Design(3) → Development(4) + Test AUTHORING(5a, PPG-1 병렬) → Test EXECUTION(5b) →
  Docs(6) → Retrospective(7).

> 캐스케이딩 블로킹: 선택 단계 전무로 해당 없음. Design 산출(research·tasks) 후 PPG-1 진입.

## security 폴더 생략 사유

본 spec 폴더에는 `security/` 디렉토리를 생성하지 않는다. Security Agent: N(위 결정 근거 참조 — 본 차수는
기존 토큰 처리 로직의 추출·일원화이며 인증 메커니즘 변경 0, 실제 토큰 저장은 console 위임, 익명 요청 분리,
openapi-fetch 는 새 공격 표면 미추가). 보안 영향 분석은 본 selection-phases.md 의 Security Agent 결정 근거 +
plan.md §보안 노트(토큰 처리·저장 위임·익명 분리·신규 공격 표면·OWASP 결론)로 갈음한다. 001(인프라/코드젠)
이 security 폴더를 생략한 것과 동일 패턴이다.

## 결정 일시 및 결정자

- 결정 일시: 2026-06-30 00:40
- 결정자: Planning Agent (2단계, retroactive)
