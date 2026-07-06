---
작성: Spec Agent
버전: v1.0
최종 수정: 2026-07-03 [시각 미확인]
상태: 확정
---

# Assumptions: 015-naver-code-exchange

## 목차

- [ASM 목록](#asm-목록)

---

## ASM 목록

| ASM | 가정 내용 | 확인 필요 여부 | 확인 방법 |
|---|---|---|---|
| ASM-001 | 모바일에서 네이버 authorization code 를 획득하는 정확한 메커니즘(Flutter 패키지·커스텀 URL 스킴 문자열)은 시스템 브라우저 + 커스텀 URL 스킴 리다이렉트라는 아키텍처(사용자 확정, Q-C)를 전제로 Design 단계에서 확정한다. `mobile/customer_app/pubspec.yaml` 확인 결과 관련 패키지(`app_links`/`uni_links`/`flutter_web_auth_2` 등)·기존 딥링크 인프라가 전무하여 신규 도입이 필요하다(014 ASM-002 와 동일 위임 패턴). | 예 — Design 단계 확정 필요 | `research.md` `[TO-VERIFY]` 마커로 조사·확정, plan.md ADR 반영 |
| ASM-002 | 네이버 실 크레덴셜(`NAVER_CLIENT_ID`·`NAVER_CLIENT_SECRET`) 발급, 네이버 개발자센터 앱 등록·redirect URI 등록은 운영 셋업 단계에서 수행한다. 본 spec 파이프라인 검증은 stub/mock 을 사용한다(014 ADR-007 패턴 계승, 사용자 확정 Q-B). | 예 — 운영 배포 전 확인 필요 | `infra.md` §7 배포 전 확인 체크리스트 갱신·운영 배포 시 크레덴셜 주입 확인 |
| ASM-003 | 네이버 오픈API 가 PKCE(Proof Key for Code Exchange)를 지원하는지 여부는 확인되지 않았다. 미지원이어도 `client_secret` 교환(표준 confidential client 흐름)만으로 NFR-003 의 보안 요구사항을 충족할 수 있다고 가정한다. | 선택 — Design 이 공식문서로 확인 권장 | Design 단계 공식문서 조사, 지원 시 plan.md ADR 에 채택 여부 기록 |
| ASM-004 | Naver code-exchange 도입은 기존 `kakao.provider.ts`·`google.provider.ts`·`social-auth.service.ts` 의 계정해석 로직 구조를 변경하지 않고, `naver.provider.ts` 재작성과 `AUTO_LINK_PROVIDERS`·`SocialProviderResolver`·`SocialLoginDto`·`AuthModule`·Flutter UI 의 naver 재편입만으로 완결된다는 전제. 사용자 확정(Q-A)으로 이미 범위가 고정되어 별도 확인 불요, 기록용으로만 등재. | 아니오(확정됨) | 해당 없음 — Planning/Design 이 본 전제 위반 발견 시 status: BLOCKED 로 Spec 복귀 |

---

## 참고

- ASM-001·ASM-002 는 014-social-login 의 ASM-002(Flutter SDK 네이티브 설정 deferred)·ASM-004(제공자 콘솔 크레덴셜 요구사항 deferred) 와 동일한 위임 패턴을 계승한다.
- ASM-003 은 spec 요구사항 충족에 필수적이지 않은 선택적 보안 강화 항목이며, 미해결 상태로도 spec 완료 기준(SC-XXX)에 영향을 주지 않는다.
