---
작성: Planning Agent
버전: v1.0
최종 수정: 2026-07-04 [시각 미확인, spawn 기준 03:53]
상태: 확정
---

# selection-phases.md

## 목차

- [선택 단계 활성화 결정](#선택-단계-활성화-결정)
- [신규 npm 의존성 자가 점검 (PATCH-A15)](#신규-npm-의존성-자가-점검-patch-a15)
- [활성화된 단계 실행 순서](#활성화된-단계-실행-순서)

---

## 선택 단계 활성화 결정

- **Database Design Agent**: **N** — spec 에 DB 스키마 변경·생성·마이그레이션이 없다(plan.md "데이터 모델: 변경 없음"). rate limit 은 인-메모리, 트랙 3·4 는 기존 테이블 트랜잭션 경계 조정만. SC-018 이 신규 저장소 의존 0건을 정적 검증. 활성화 조건(FR/NFR 에 스키마 변경 명시) 미충족.

- **Deploy Agent**: **N** — spec 에 Dockerfile / docker-compose / CI(fly.toml, `.github/workflows/ci.yml`) 변경이 명시되지 않았다(spec "범위 외: Fly.io 배포 구성 변경"). `main.ts` trust proxy 는 앱 코드이지 배포 구성이 아니다. 신규 npm 의존 `@nestjs/throttler` 는 `pnpm install` 로 자동 설치되며 Dockerfile 변경 불요(아래 PATCH-A15 자가 점검 참조). 활성화 조건(배포 환경 구성/컨테이너화/CI 변경 명시) 미충족.

- **Security Agent**: **Y** — 본 spec **자체가 auth 도메인 보안 하드닝**이며 FR/NFR 에 인증·PII·보안(rate limit·세션 폐기·감사 로그·마스킹)이 명시되어 있다. 선행 spec 의 미해소 보안 부채(SEC-013-09/10/11·SEC-014-01/06 = context.md §6 4개 행)를 해소하므로, 구현 후 **재감사로 해당 SEC 항목을 RESOLVED 로 판정**해야 한다(활성화 조건 명확 충족). 특히 트랙 2(Fly-Client-IP 신뢰) 의 XFF 스푸핑 표면, 트랙 5 감사 로그의 PII 마스킹 완결성(SC-019)은 보안 재검토 대상이다.

- **Performance Agent**: **N** — spec 에 응답속도(P95 등)·처리량의 **수치 성능 목표 NFR 이 없다**. NFR-001~006 은 성능 목표가 아니라 보안 rate limit 상한(카운트)이며, NFR-010(회귀 0건)은 성능 최적화 목표가 아닌 회귀 가드로 SC-020(전체 unit 회귀)이 커버한다. throttler 인-메모리 카운터 오버헤드는 O(1) 수준으로 무시 가능. 활성화는 "NFR 에 성능 수치 명시" 시에만 허용되며(암묵 연관 활성화 금지), 본 spec 은 미충족 → **N**. (main session 이 경험적 오버헤드 측정을 원하면 Plan Mode 에서 활성화 결정 가능 — 단 활성화 기준상 기본값은 N.)

---

## 신규 npm 의존성 자가 점검 (PATCH-A15)

```
자가 점검: 본 spec 에 신규 npm 의존성 추가가 있는가? (package.json dependencies 변경)
  → 있음 (@nestjs/throttler 1건)
  → [env:e2e-docker] 태그 SC 존재하는가? → 부재 (SC 는 unit/integration/static 만; e2e-docker 없음)
  → 결론: Deploy Agent 비활성. 근거 — "신규 의존성 추가만, Dockerfile/docker-compose 미변경,
    e2e-docker 검증 대상 SC 부재. pnpm install 자동 설치로 정적 갈음."
```

---

## 활성화된 단계 실행 순서

Security Agent (6단계 후 / 7단계 전, 단독). Deploy·Performance 비활성이므로 캐스케이딩 블로킹 없음.

**결정 일시 및 결정자**: 2026-07-04 [시각 미확인, spawn 기준 03:53] / Planning Agent (main session 최종 승인 게이트 위임)
</content>
