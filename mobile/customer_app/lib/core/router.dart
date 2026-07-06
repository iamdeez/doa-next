/// 라우팅 — Navigator.push 기반 (go_router 미사용)
///
/// 라우트 목록:
///   /login                    → LoginScreen
///   /forgot-password          → ForgotPasswordScreen
///   /find-email               → FindEmailScreen
///   /mypage/profile-edit      → ProfileEditScreen
///   /mypage/notification      → NotificationSettingsScreen
///   /support/faq              → FaqScreen
///   /support/notice           → NoticeScreen
///   /mileage                  → MileageScreen
///
/// 구현 패턴:
///   Navigator.push(context, MaterialPageRoute(builder: (_) => const TargetScreen()))
///
/// go_router 를 사용하지 않는 이유: 소규모 단방향 내비게이션, deep link 불필요 (ADR-008).
library;
