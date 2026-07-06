---
작성: Deploy Agent
버전: v1.0
최종 수정: 2026-07-06 03:04
상태: 확정
---

# Deploy Report: 021-payment-file-integration

> Branch: 021-payment-file-integration | Plan: [../planning/plan.md](../planning/plan.md) | selection-phases: [../planning/selection-phases.md](../planning/selection-phases.md)

## 목차

- [1. 검증 범위 및 방법](#1-검증-범위-및-방법)
- [2. 신규 의존성 배포 영향 — 실 `docker build` 검증](#2-신규-의존성-배포-영향--실-docker-build-검증)
- [3. env/secret 구성 완결성](#3-envsecret-구성-완결성)
- [4. DI 팩토리 안전 부팅 — 실 컨테이너 런타임 검증](#4-di-팩토리-안전-부팅--실-컨테이너-런타임-검증)
- [5. 기존 배포 구성 무변경 확인](#5-기존-배포-구성-무변경-확인)
- [6. CI 영향](#6-ci-영향)
- [7. infra.md 갱신 필요 사항](#7-inframa-갱신-필요-사항)
- [8. 종합 판정](#8-종합-판정)

---

## 1. 검증 범위 및 방법

본 spec 은 도메인 코드 변경(신규 Port 구현체 2종 + DI 팩토리 전환)이 실제 존재하는 spec 이므로, 배포 구성 자체(Dockerfile·fly.toml·CI workflow)의 무변경 여부와, 신규 의존성·신규 env 가 기존 배포 파이프라인에 미치는 영향을 **동적 검증**(실 `docker build` + 실 컨테이너 기동)으로 확인했다. Docker 가용 환경(`docker 28.4.0`, 로컬 postgres 컨테이너 기동 중)이므로 §1.9.1 정적 검증 갈음은 적용하지 않는다.

- `docker build -f apps/backend/Dockerfile -t doa-backend-verify:021 .` (저장소 루트 컨텍스트, CI와 동일 명령) — 실행.
- 빌드된 이미지로 `docker run`(네트워크: `doa-next_default`, 로컬 `doa-next-postgres-1` 재사용) — stub 기본 부팅 1회 + `PAYMENT_PROVIDER=inicis`/`FILE_STORAGE=r2` 각각 크레덴셜 미설정 fail-fast 2회, 총 3회 실행.
- `.env.example` ↔ `inicis.config.ts`/`r2.config.ts` 실제 `process.env[...]` 참조 키 대조.
- `git diff 1dd5132 -- apps/backend/Dockerfile fly.toml .github/workflows/ci.yml` 로 기존 배포 구성 무변경 확인.
- 검증 후 `docker rm -f`/`docker rmi` 로 생성한 컨테이너·이미지 전부 정리, `git status --short` 로 의도치 않은 파일 없음 확인.

---

## 2. 신규 의존성 배포 영향 — 실 `docker build` 검증

**PASS.**

```
docker build -f apps/backend/Dockerfile -t doa-backend-verify:021 .
```

→ 전체 22 layer 성공(에러 0), 총 소요 약 82초(로컬 캐시 없음 기준). 세부:

- `RUN pnpm install --frozen-lockfile`(builder, devDeps 포함)·`RUN pnpm install --frozen-lockfile --prod`(runtime) 양쪽 모두 `pnpm-lock.yaml` 과 `package.json`(`@aws-sdk/client-s3@^3.1079.0`·`@aws-sdk/s3-request-presigner@^3.1079.0` 신규 포함) 정합 확인 — "Lockfile is up to date, resolution step is skipped" (lockfile 재생성 누락 없음).
- `RUN pnpm --filter backend exec prisma generate` → `RUN pnpm --filter backend run build`(nest build) 정상 완료.
- `COPY --from=builder /app/node_modules/.pnpm ./node_modules/.pnpm`(runtime) 로 `.pnpm` hoisted 전체 복사 — 별도 `@aws-sdk/*` 개별 COPY 라인 불필요(`~/.claude/rules/on-demand/docker.md` pnpm+Prisma 주의사항과 동일 원리, 이번엔 Prisma 대신 AWS SDK 지만 hoist 구조는 동일).
- 빌드된 이미지 내부 확인: `node_modules/.pnpm/@aws-sdk+client-s3@3.1079.0`·`node_modules/.pnpm/@aws-sdk+s3-request-presigner@3.1079.0` 양쪽 실존 확인(`fs.readdirSync` 로 직접 조회).
- 이미지 크기·빌드 시간 증가는 관측되었으나(신규 2개 패키지 추가, exporting layer 25.5s) `node:20-alpine` 멀티스테이지 구조상 정상 범위 — 별도 최적화 조치 불필요 판정.

## 3. env/secret 구성 완결성

**PASS.**

`.env.example` 신규 항목과 `inicis.config.ts`/`r2.config.ts`(`registerAs`) 의 실제 `process.env[...]` 참조를 1:1 대조:

| 코드 참조 (`inicis.config.ts`) | `.env.example` | 일치 |
|---|---|---|
| `INICIS_MID` | 존재 | ✓ |
| `INICIS_SIGN_KEY` | 존재 | ✓ |
| `INICIS_API_BASE_URL` | 존재 | ✓ |
| `INICIS_API_KEY` | 존재 | ✓ |
| `INICIS_API_IV` | 존재 | ✓ |

| 코드 참조 (`r2.config.ts`) | `.env.example` | 일치 |
|---|---|---|
| `R2_ACCOUNT_ID` | 존재 | ✓ |
| `R2_ACCESS_KEY_ID` | 존재 | ✓ |
| `R2_SECRET_ACCESS_KEY` | 존재 | ✓ |
| `R2_BUCKET` | 존재 | ✓ |
| `R2_PUBLIC_BASE_URL` | 존재 | ✓ |

`PAYMENT_PROVIDER`(기본값 `stub`)·`FILE_STORAGE`(기본값 `stub`) env 스위치 값·주석(`inicis|stub`, `r2|stub`, "미설정 시 안전 기본값 stub")이 `.env.example` 에 명시되어 있으며 `payment.module.ts`/`file.module.ts` 의 실제 분기(`provider === 'inicis'`/`provider === 'r2'`, 그 외 전부 stub)와 일치. 실제 크레덴셜 값은 `.env.example` 에 기재되지 않음(플레이스홀더만 — MUST NOT 위반 없음).

## 4. DI 팩토리 안전 부팅 — 실 컨테이너 런타임 검증

**PASS.** Development/Test Agent 의 e2e 보고(§7 시작 절차 5)를 재신뢰하지 않고 실 컨테이너로 독립 재검증했다.

### 4-1. env 미설정 시 stub 기본 부팅(회귀 방지) — 실측 PASS

```
docker run --network doa-next_default \
  -e DATABASE_URL=postgresql://doa:doa_local@postgres:5432/doa_next \
  -e JWT_ACCESS_SECRET=*** -e JWT_REFRESH_SECRET=*** \
  -e NODE_ENV=production -e PORT=3000 \
  doa-backend-verify:021
```

→ `PAYMENT_PROVIDER`/`FILE_STORAGE` 미설정 상태로 `Nest application successfully started` 로그 확인 + `GET /health` 실 HTTP 요청 → `200` 응답(pino 요청 로그 `"statusCode":200`) 실측. `StubPaymentGateway`/`StubFileStorage` fallback 이 정상 작동하여 크레덴셜 부재에도 앱 기동이 방해받지 않음을 컨테이너 레벨에서 확인(ASM-013 안전망 유효).

### 4-2. `PAYMENT_PROVIDER=inicis` + 필수 env 부재 → fail-fast — 실측 PASS

동일 컨테이너에 `PAYMENT_PROVIDER=inicis`(`INICIS_*` 미설정) 추가 실행 → 부팅 직후 아래 에러로 **명확히 실패**(silent fallback 없음):

```
Error: IniisisPaymentGateway requires INICIS_MID, INICIS_SIGN_KEY, INICIS_API_BASE_URL (PAYMENT_PROVIDER=inicis)
    at new IniisisPaymentGateway (.../inicis-payment-gateway.js:52:19)
    at InstanceWrapper.useFactory (.../payment.module.js:40:27)
```

프로세스가 정상 서비스 상태로 진입하지 못하고 종료 — Fly.io 배포 시 헬스체크 실패 → 배포 실패로 즉시 드러나는 구조(silent degrade 아님).

### 4-3. `FILE_STORAGE=r2` + 필수 env 부재 → fail-fast — 실측 PASS

동일 방식으로 `FILE_STORAGE=r2`(`R2_*` 미설정) 단독 실행 → 아래 에러 확인:

```
Error: R2FileStorage requires R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE_URL (FILE_STORAGE=r2)
    at new R2FileStorage (.../r2-file-storage.js:26:19)
    at InstanceWrapper.useFactory (.../file.module.js:34:48)
```

4-1~4-3 종합: **stub 기본 부팅 회귀 방지**와 **실 provider 선택 시 fail-fast**(silent 프로덕션 오동작 방지) 양쪽 모두 코드 주장(`inicis.config.ts`/`r2.config.ts` 주석) 대로 실 컨테이너에서 재현됨을 확인. `test/static/provider-env-switch.spec.ts`(SC-008, 정적 검증)의 4개 단언(useFactory 사용·env 분기·stub fallback·config 무조건 throw 금지)과 본 동적 검증 결과가 상호 정합.

## 5. 기존 배포 구성 무변경 확인

**PASS.**

```
git diff 1dd5132 -- apps/backend/Dockerfile fly.toml .github/workflows/ci.yml
```

→ 출력 0건. `git status --short` 로도 세 파일 변경 0건 확인. 본 spec 은 020(데이터 이관)과 달리 **실제 도메인 코드 변경이 존재**하는 spec 이지만, 그 변경 표면은 전부 `apps/backend/src/modules/{payment,file}/**`·`.env.example`·`package.json`·`pnpm-lock.yaml` 범위 내에 있으며 배포 파이프라인 자체(이미지 빌드 방식·Fly 앱 구성·CI 단계 구성)는 무변경 — Fly secrets 신규 등록(ASM-008, §7 참조)만으로 흡수 가능한 구조임을 확인.

## 6. CI 영향

**PASS(구조 확인 — 실행은 GitHub Actions 환경, 로컬 재현 범위 한정).**

`.github/workflows/ci.yml` 체인: `lint → typecheck → test → docker-build`(각 단계 `needs` 로 직렬 의존).

- `lint`/`typecheck` — Test Agent(5b) 가 독립 재실행한 `tsc --noEmit`(0 error)·ESLint 대상 코드(`inicis-payment-gateway.ts`·`r2-file-storage.ts`·`*.config.ts`·`payment.module.ts`·`file.module.ts`) 신규 문법 오류 없음(빌드 성공 자체가 typecheck 통과 전제 — 본 세션 `docker build` 의 `nest build` 단계 성공으로 재확인).
- `test`(unit, `jest` — e2e 미포함) — Test Agent(5b) 보고: unit 409/409 PASS. 신규 `inicis-payment-gateway.spec.ts` 포함.
- `docker-build` — 본 세션이 동일 명령(`docker build -f apps/backend/Dockerfile .`)으로 직접 재현, 성공(§2).
- `package.json`/`pnpm-lock.yaml` 정합 — `pnpm install --frozen-lockfile` 이 builder·runtime 두 스테이지에서 모두 "Lockfile is up to date" 로 통과했으므로 CI 의 동일 명령도 동일하게 통과할 구조(로컬 lockfile 이 최신 상태로 커밋 준비됨).

## 7. infra.md 갱신 필요 사항

**직접 갱신하지 않음**(deploy.md 금지 사항 — infra.md 직접 갱신 금지). Docs Agent 가 이미 `gaps.md` **GAP-021-03**(OPEN, Retrospective Agent 반영 위임)에 다음을 코드 검증까지 완료하여 상세 기록해 두었음을 확인:

- infra.md §3.4 외부 연동에 KG이니시스(sandbox) 신규 행 추가 필요.
- infra.md §5 재시도 동작 표의 R2/PG사 행이 021 이전부터 존재하던 aspirational 서술이었음(021 완료로 사실과 일치하게 됨, 벤더명 "이니시스" 명시만 보완 필요).
- infra.md §6 의존성 구조 표에 `@aws-sdk/s3-request-presigner` 행 누락 — 추가 필요(`@aws-sdk/client-s3` 만 등재된 상태 확인, 본 세션 이미지 내부 조회로 두 패키지 모두 실치 확인 — §2).
- infra.md §7 배포 전 체크리스트에 `INICIS_MID`·`INICIS_SIGN_KEY`·`INICIS_API_BASE_URL`·`INICIS_API_KEY`·`INICIS_API_IV`·`R2_ACCOUNT_ID`·`R2_ACCESS_KEY_ID`·`R2_SECRET_ACCESS_KEY`·`R2_BUCKET`·`R2_PUBLIC_BASE_URL`·`PAYMENT_PROVIDER`·`FILE_STORAGE` Fly secret 확인 항목 추가 필요(ASM-008 — 실제 등록은 사용자 책임, 본 Deploy Agent 도 동일하게 자격증명 실값을 다루지 않음).
- infra.md §8 알려진 인프라 제약에 "실 MID 미발급 — sandbox 전용" 행 추가 필요.

본 Deploy Agent 재확인 결과 위 GAP-021-03 기록 내용이 실제 코드·이미지 상태와 정합함을 §2·§3 에서 교차 확인했다(중복 GAP 생성 없음).

## 8. 종합 판정

| 검증 영역 | 결과 |
|---|---|
| 신규 의존성 배포 영향(§2, 실 `docker build`) | PASS |
| env/secret 구성 완결성(§3) | PASS |
| DI 팩토리 안전 부팅(§4, 실 컨테이너 3회 실행) | PASS |
| 기존 배포 구성 무변경(§5) | PASS |
| CI 영향(§6) | PASS |
| infra.md 갱신 필요 사항(§7) | 기존 GAP-021-03 확인·교차검증 완료(OPEN 유지, Retrospective 위임) |

**gate: PASS.** 배포 구성 결함 없음. Security Agent·Performance Agent 진행 가능(캐스케이딩 블로킹 없음).
