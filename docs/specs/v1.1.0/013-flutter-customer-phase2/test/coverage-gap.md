---
작성: Test Agent (EXECUTION)
버전: v1.2
최종 수정: 2026-07-01 13:21
상태: 확정 (재작업 2회차)
---

# Coverage Gap: 013-flutter-customer-phase2

| SC-ID | 미커버 시나리오 | 카테고리 | 검증 방법 | 환경/도구 | 담당 | 비고 |
|---|---|---|---|---|---|---|
| SC-001 | CategoryScreen 실제 API 연동 → 카테고리 목록 렌더 (Flutter 앱 실행 환경) | (2) 단위테스트 불가 | 앱 실행 후 카테고리 화면 진입 + 목록 표시 확인 | Flutter 디바이스/에뮬레이터 + 백엔드 서버 | 개발/QA | 단위 테스트(SC-001 Happy)는 provider mock으로 렌더만 검증. 실 API 연동은 integration 환경 필요 |
| SC-025 | GET /categories P95 응답시간 3초 이내 | (3) 운영 환경 권장 | 실 트래픽 하에서 응답시간 모니터링 (e.g., Grafana P95 측정) | 운영 서버 + APM | 운영 | NFR-001 — 로드 조건 필요. 개발 환경 측정 불가 |
| SC-026 | `flutter analyze` 실행 결과 0 issues | (3) 운영 환경 권장 | CI 파이프라인의 `flutter analyze` 단계 | GitHub Actions / CI | 개발 | static_verification_test.dart는 파일 구조 보조 검증만 수행. analyze는 CI 책임 (test 파일 내 주석 명시). 현재 analyze 6 issues 발견 (아래 참조) |

> 카테고리 (1) 항목 0건 → Development Agent 복귀 불필요.
> 카테고리 (2)(3)만 존재 → Docs Agent 진행 가능.

---

## 보조: flutter analyze 6 issues 상세 (SC-026 관련)

`flutter analyze` 실행 결과 6 issues — 모두 test 파일 내 (production lib/ 이슈 0건).

| 구분 | 파일 | 라인 | 유형 | 내용 | 도입 시점 |
|---|---|---|---|---|---|
| 신규 | `test/features/support_actions_test.dart` | 40:16 | warning | `override_on_non_overriding_member` — `canLaunch(String)`이 `UrlLauncherPlatform`의 overridable 멤버 아님 | 5a rework 2회차 (SC-008 [B] 수정 시 `@override` 추가) |
| 기존 | `test/features/support_actions_test.dart` | 13:8 | info | `depend_on_referenced_packages` — `plugin_platform_interface` 미선언 dev_dependency | 5a original |
| 기존 | `test/features/support_actions_test.dart` | 14:8 | info | `depend_on_referenced_packages` — `url_launcher_platform_interface` 미선언 dev_dependency | 5a original |
| 기존 | `test/features/category_screen_test.dart` | 25:34 | warning | `unused_element` — `_mockCategories` 선언 후 미참조 | 5a original |
| 기존 | `test/features/mileage_screen_test.dart` | 53:15 | warning | `unused_local_variable` — `anyFound` 산출 후 미사용 | 5a original |
| 기존 | `test/static_verification_test.dart` | 17:8 | info | `depend_on_referenced_packages` — `path` 미선언 dev_dependency | 5a original |

**해소 방법 (CI 단계에서 적용 권장)**:
1. `@override` 제거 또는 `// ignore: override_on_non_overriding_member` 추가 (support_actions_test.dart:40)
2. `pubspec.yaml` dev_dependencies에 `plugin_platform_interface`, `url_launcher_platform_interface`, `path` 추가
3. `_mockCategories` 제거 또는 실제 provider override에 활용
4. `anyFound` 변수를 assertion에 사용하거나 제거
