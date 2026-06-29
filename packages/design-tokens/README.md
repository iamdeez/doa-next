# @doa/design-tokens

> DOA Market 디자인 토큰 **SSOT**(W3C DTCG JSON) → Style Dictionary → 웹·Flutter 산출물 자동 생성.
> 설계 근거는 루트 `DESIGN-PLAN.md` §3.

## 목차

- [구조](#구조)
- [빌드](#빌드)
- [산출물](#산출물)
- [소비 방법](#소비-방법)
- [원칙](#원칙)

## 구조

3계층 — **primitive → semantic → theme**. primitive 는 참조 전용(노출 안 함), theme 차이는 색상만 분기.

```
tokens/
├── primitive/   color·dimension·typography·effect (원시값, $value/$type)
└── semantic/    base(theme 독립: radius·space·text·motion)
                 color.light·color.dark (의미 색상 — bg·fg·border·accent·status)
build.mjs        Style Dictionary 빌드 스크립트
build/           산출물 (생성물)
```

## 빌드

```bash
pnpm --filter @doa/design-tokens build
```

## 산출물

| 파일 | 용도 |
|---|---|
| `build/web/tokens.css` | CSS 변수 — `:root`(light 전체) + `.dark`(색상 오버라이드). |
| `build/web/tailwind-preset.cjs` | Tailwind `theme.extend`(colors·borderRadius·spacing·fontSize → `var(--…)`). |
| `build/flutter/light_tokens.dart` · `dark_tokens.dart` | Dart `Color`·`double` 상수(`DoaLightTokens`·`DoaDarkTokens`). |

## 소비 방법

- **console(웹)**: `tokens.css` import(`:root`/`.dark` 변수 활성) + Tailwind 설정에 `tailwind-preset.cjs` 적용. 컴포넌트는 `bg-surface`·`text-fg-default`·`rounded-control` 등 시맨틱 클래스 사용.
- **customer_app(Flutter)**: `*_tokens.dart` 를 `ThemeData`(ColorScheme·shape) 구성에 사용. (Phase 5)

## 원칙

- 토큰 변경은 **이 패키지의 JSON 만** 수정 → 빌드 → 양 플랫폼 반영. 앱·컴포넌트에서 원시 색상/치수 하드코딩 금지.
- primitive 값은 CSS 변수로 노출하지 않는다(semantic 만). 다크모드는 `semantic/color.dark.json` 만 분기.
- `build/` 는 생성물이며 재생성 가능(`build` 스크립트). 편의상 레포에 커밋한다.
