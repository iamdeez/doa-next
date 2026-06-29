---
작성: Planning Agent
버전: v1.0
최종 수정: 2026-06-30 01:23
상태: 확정 (retroactive)
---

# selection-phases.md

## 목차

- [선택 단계 활성화 결정](#선택-단계-활성화-결정)
- [신규 PyPI/npm 의존성 자가 점검](#신규-pypinpm-의존성-자가-점검)
- [활성화된 단계 실행 순서](#활성화된-단계-실행-순서)
- [결정 일시 및 결정자](#결정-일시-및-결정자)

## 선택 단계 활성화 결정

> 활성화 기준: spec.md FR/NFR 에 **명시적 요구사항**이 존재할 때만 활성화(암묵적 연관 금지).

- **Database Design Agent**: **N**
  - 근거: DB 스키마 변경 0(마이그레이션 없음). 신규 테이블·컬럼·enum·인덱스·제약 0건. 본 차수는 기존
    `shipment`·`order` 테이블의 신규 **조회 경로**(`findByOrderId` — `where orderId` + `orderBy createdAt
    desc`)만 추가하며 영속 구조 변경이 없다. 응답 view 타입(`SellerOrderDetail`·`OrderItemView`)은 HTTP
    응답 표현이며 신규 저장소가 아니다.

- **Deploy Agent**: **N**
  - 근거: FR/NFR 에 배포 환경 구성·컨테이너화·CI/CD 변경 명시 없음. `Dockerfile`·`docker-compose`·`env`
    변경 0. 신규 의존성 0(`package.json` 변경 없음). 신규 라우트 2개는 기존 backend NestJS 빌드·console
    Next.js 빌드에 포함되어 별도 배포 토폴로지·환경변수 변경이 없다.

- **Security Agent**: **Y**
  - 근거: 본 차수는 **권한·인가 로직을 신규 추가·리팩토링** 한다 — (1) 주문 기준 송장 조회(`getByOrder`)에
    권한 3축(`_assertCanViewOrder`) 적용, (2) `getTracking` 의 인라인 권한 검증을 헬퍼로 추출(공유), (3)
    판매자 단건 주문 상세(`getSellerOrderDetail`)에 본인 소유 검증(미존재 404·비소유 403) 추가. 인가
    경계가 바뀌므로(추출 동작 불변 + 신규 라우트 2개) IDOR/권한 우회·정보 누출 관점의 보안 검토가 필요하다.
    OWASP A01(Broken Access Control)·A04(Insecure Design — null vs 404 신호) 직접 관련. security/
    security-report.md 로 검토 결과를 산출한다.

- **Performance Agent**: **N**
  - 근거: NFR 에 성능 목표 수치(P95·처리량) 명시 없음. 신규 라우트는 단건 조회(`findByOrderId` 인덱스 조회·
    `findById`)이며 핫패스·알고리즘 변경 0. 런타임 오버헤드를 추가하는 신규 의존성 0. 주문당 송장 1건 가정
    (`findFirst`)으로 N+1·풀스캔 위험 없음.

## 신규 PyPI/npm 의존성 자가 점검

```
자가 점검: 본 spec 에 신규 의존성 추가가 있는가? (package.json dependencies 변경)
  → 없음. `git diff --numstat 8bba04d 8b48eb5` 변경 파일 12종에 `package.json` 부재.
  → 기존 패키지(NestJS·Prisma·@tanstack/react-query·@doa/*)만 사용.
  → P-002(AWS 의존 금지) 무저촉(신규 의존 0). Deploy Agent 활성 불요(배포 영향 없음).
```

## 활성화된 단계 실행 순서

- 활성 선택 단계: **Security Agent** (Docs(6) 후 / Retrospective(7) 전).
- 진행: Design(3) → Development(4) + Test AUTHORING(5a, PPG-1 병렬) → Test EXECUTION(5b) → Docs(6) →
  **Security** → Retrospective(7).

> 캐스케이딩 블로킹: Deploy=N 이므로 Security 독립 실행. Security 가 Critical/High 발견 시 Performance 스킵
> 규칙은 Performance=N 이라 무관. Security 결과는 security/security-report.md.

## 결정 일시 및 결정자

- 결정 일시: 2026-06-30 01:23
- 결정자: Planning Agent (2단계, retroactive)
</content>
