# 소셜 로그인 운영 셋업 가이드

> 코드(v1.1.0/014·015·016)는 완결·검증 완료됐고, **실동작에 필요한 운영 작업**만 남았다.
> 이 문서는 그 잔여 작업(OAuth 앱 등록 → Fly secret 주입 → 네이티브 배선 → 사후 검증)의 절차다.
> 현재 앱은 `StubSocialAuthService`(고정값)를 사용하므로 실 소셜 로그인은 아직 동작하지 않는다.

## 목차

- [현재 상태 요약](#현재-상태-요약)
- [1. OAuth 앱 등록](#1-oauth-앱-등록)
  - [카카오](#카카오)
  - [구글](#구글)
  - [네이버](#네이버)
- [2. Fly secret 주입](#2-fly-secret-주입)
- [3. Flutter 네이티브 배선](#3-flutter-네이티브-배선)
- [4. NAVER_REDIRECT_URI 결정](#4-naver_redirect_uri-결정)
- [5. PROC-014 사후 운영 검증](#5-proc-014-사후-운영-검증)

---

## 현재 상태 요약

| 항목 | 상태 |
|---|---|
| 백엔드 provider 3종(카카오·구글·네이버) | ✅ 구현·검증 (334 tests PASS) |
| 네이버 code-exchange(client_secret 서버 교환) | ✅ 구현 (`naver.provider.ts`) |
| state CSRF 서버측 발급·검증 (`POST /auth/naver/state`) | ✅ 구현 (SEC-015-02 RESOLVED) |
| 자동연동 정책 | 카카오·구글만 (네이버는 SEC-015-01로 제외 — 409 Conflict) |
| Flutter 소셜 버튼·흐름 | ✅ UI·흐름 구현, `flutter_web_auth_2` 선언 |
| **실 OAuth 크레덴셜** | ⛔ 미등록 (본 문서 §1·§2) |
| **네이티브 실배선** | ⛔ `StubSocialAuthService` 고정값 (본 문서 §3) |

---

## 1. OAuth 앱 등록

각 provider 개발자 콘솔에서 앱을 등록하고 크레덴셜을 발급받는다.

### 카카오

- [Kakao Developers](https://developers.kakao.com) → 애플리케이션 추가
- **REST API 키** → `KAKAO_REST_API_KEY`, **앱 키(네이티브/앱 ID)** → `KAKAO_APP_ID`
- 플랫폼: iOS 번들 ID / Android 패키지명·키 해시 등록
- 카카오 로그인 활성화 + 동의 항목에 **이메일** 포함 (백엔드 계정 해석이 email 기준)

### 구글

- [Google Cloud Console](https://console.cloud.google.com) → OAuth 2.0 클라이언트 ID 생성
- iOS·Android 클라이언트 각각 생성 → 백엔드 검증용 **웹/공용 client_id** → `GOOGLE_CLIENT_ID`
- 백엔드는 ID 토큰의 `aud`(client_id)·`email_verified` 를 검증하므로 `GOOGLE_CLIENT_ID` 는 앱이 받는 ID 토큰의 audience 와 일치해야 한다.

### 네이버

- [네이버 개발자센터](https://developers.naver.com) → 애플리케이션 등록
- **Client ID** → `NAVER_CLIENT_ID`, **Client Secret** → `NAVER_CLIENT_SECRET`
- 서비스 URL·**Callback URL** 등록 (§3 커스텀 스킴 또는 §4 redirect_uri 와 일치)
- 필수 제공 정보에 **이메일** 포함
- 네이버는 confidential-client 서버 교환(code → token)이므로 `client_secret` 은 **백엔드에만** 둔다(앱에 넣지 않는다).

---

## 2. Fly secret 주입

비밀 값은 `.env` 가 아니라 Fly secret 으로 주입한다(infra.md §7). 앱별(dev/prod)로 각각 설정한다.

```bash
# 저장소 루트에서 (fly.toml 기준 앱)
flyctl secrets set \
  KAKAO_REST_API_KEY=xxx \
  KAKAO_APP_ID=xxx \
  GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com \
  NAVER_CLIENT_ID=xxx \
  NAVER_CLIENT_SECRET=xxx \
  --app doa-next-backend        # [교체] dev/prod 앱 이름
```

- 미설정 시 해당 provider 는 `verify()` 호출 시점에 **fail-closed**(앱 기동 자체는 무영향, infra.md §7).
- `.env.example` 의 전체 키 목록이 기준이다. 소셜 외 필수(`DATABASE_URL`·`JWT_*`·`ADMIN_USER_IDS`·`CORS_ORIGIN`·SMTP)도 함께 확인.
- `NAVER_REDIRECT_URI` 는 선택 — §4 참조.

---

## 3. Flutter 네이티브 배선

현재 `mobile/customer_app/lib/core/providers.dart:16` 이 `StubSocialAuthService()` 를 반환한다.
실 구현체를 만들어 이 지점만 교체하면 된다.

**교체 지점 (단일):**

```dart
// providers.dart
final socialAuthServiceProvider = Provider<SocialAuthService>(
  (_) => RealSocialAuthService(),   // ← StubSocialAuthService() 에서 교체
);
```

**구현할 것 (`SocialAuthService` 추상 계약 — `signInWithKakao/Google/Naver`):**

- **카카오·구글**: 각 SDK(`kakao_flutter_sdk` / `google_sign_in`)로 로그인 → access token(카카오) / ID token(구글) 획득 → `SocialCredential(provider, token)` 반환 (state 없음).
- **네이버** (`flutter_web_auth_2`, 시스템 브라우저 + 커스텀 URL 스킴):
  1. 백엔드 `POST /auth/naver/state` 호출 → 서버 발급 `state` 수신.
  2. 네이버 인증 URL(`nid.naver.com/oauth2.0/authorize`)에 `client_id`·`redirect_uri`(커스텀 스킴)·`state`(위에서 받은 값)·`response_type=code` 로 이동.
  3. `FlutterWebAuth2.authenticate(url, callbackUrlScheme: 'doacustomer')` 로 콜백 대기.
  4. 콜백 쿼리에서 `code` 추출 → `SocialCredential(provider:'naver', token: code, state: <같은 state>)` 반환.
  5. 백엔드는 이 code 를 `client_secret` 으로 교환하고, `state` 를 서버 발급분과 대조 검증한다(1회성 소비).
- 취소 시 `SocialAuthCancelled` throw(무오류 복귀), 실패 시 오류 메시지 표시 — 계약대로.

**네이티브 스킴 등록** (커스텀 URL 스킴, 예: `doacustomer://`):

- iOS: `ios/Runner/Info.plist` 의 `CFBundleURLTypes` 에 스킴 추가.
- Android: `android/app/src/main/AndroidManifest.xml` 에 `flutter_web_auth_2` 콜백 activity intent-filter(스킴) 추가.
- 등록한 스킴 기반 콜백 URL 을 각 provider 콘솔(§1)의 Callback URL 에 등록.

> `flutter_web_auth_2` 는 pubspec 에 선언만 되어 있고 실제 import·SDK 연동은 미완(ASM-001). 카카오·구글 SDK 패키지는 아직 pubspec 에 없으므로 추가가 필요하다.

---

### 파트 3 진행 상태 — 코드 스캐폴딩 완료분

아래는 이미 저장소에 반영됨(v1.1.0 이후 작업):
- `lib/features/auth/real_social_auth_service.dart` — `RealSocialAuthService`(kakao·google·naver 실 구현) 신규.
- `lib/core/providers.dart` — `socialAuthServiceProvider` 를 `--dart-define=USE_REAL_SOCIAL=true` 시 Real, 아니면 Stub 으로 분기(테스트·개발 기본은 Stub 유지).
- `pubspec.yaml` — `kakao_flutter_sdk_user`·`google_sign_in` 의존 추가(`flutter_web_auth_2` 기존).

**남은 것(사용자 — 크레덴셜·네이티브 설정 필요):**

**(a) 의존성 설치** (필수 선행 — 안 하면 `flutter analyze`/빌드가 미설치 패키지 오류):
```bash
cd mobile/customer_app && flutter pub get
```

**(b) `lib/main.dart` 에 카카오 SDK 초기화 추가:**
```dart
import 'package:kakao_flutter_sdk_user/kakao_flutter_sdk_user.dart';
// ...
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('ko_KR');
  KakaoSdk.init(nativeAppKey: const String.fromEnvironment('KAKAO_NATIVE_APP_KEY'));
  runApp(const ProviderScope(child: DoaApp()));
}
```

**(c) iOS `ios/Runner/Info.plist` — 네이버 콜백 커스텀 스킴 등록:**
```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>doacustomer</string>  <!-- NAVER_CALLBACK_SCHEME 과 동일 -->
    </array>
  </dict>
</array>
<!-- 카카오톡 앱 전환용 LSApplicationQueriesSchemes(kakaokompassauth·kakaolink)도 카카오 문서대로 추가 -->
```

**(d) Android `android/app/src/main/AndroidManifest.xml` — flutter_web_auth_2 콜백 activity:**
```xml
<activity android:name="com.linusu.flutter_web_auth_2.CallbackActivity"
          android:exported="true">
  <intent-filter android:label="flutter_web_auth_2">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="doacustomer" />
  </intent-filter>
</activity>
```

**(e) 실행 — dart-define 로 크레덴셜 주입:**
```bash
flutter run \
  --dart-define=USE_REAL_SOCIAL=true \
  --dart-define=KAKAO_NATIVE_APP_KEY=xxx \
  --dart-define=NAVER_CLIENT_ID=xxx \
  --dart-define=NAVER_CALLBACK_SCHEME=doacustomer \
  --dart-define=GOOGLE_SERVER_CLIENT_ID=xxx.apps.googleusercontent.com
```

> `NAVER_CALLBACK_SCHEME` 의 콜백 URL(`doacustomer://oauth/naver/callback`)을 네이버 개발자센터 Callback URL 에 등록(§1 네이버)하고, 위 (c)(d) 스킴과 정확히 일치시킨다. `GOOGLE_SERVER_CLIENT_ID` 는 백엔드 `GOOGLE_CLIENT_ID` 와 동일해야 id_token `aud` 검증이 통과한다.

## 4. NAVER_REDIRECT_URI 결정

- 백엔드(`naver.provider.ts`)는 `NAVER_REDIRECT_URI` 가 **설정된 경우에만** 토큰 교환 요청에 `redirect_uri` 를 포함한다(미설정=미포함이 기본, fail-safe).
- 네이버 공식 문서/콘솔에서 토큰 교환 시 `redirect_uri` 일치 검증을 요구하는지 확인한다.
  - 요구하면: §3에서 등록한 콜백 URL 과 **정확히 동일한 값**을 `NAVER_REDIRECT_URI` 로 secret 설정.
  - 요구 안 하면: 미설정으로 둔다(코드 변경 불요).
- 이 결정으로 SEC-015-03(잔존-권고)이 최종 종결된다.

---

## 5. PROC-014 사후 운영 검증

실 크레덴셜 발급 + §3 배선 완료 후, 아래 4개 시나리오를 실기기/실계정으로 수동 점검한다.

| # | 시나리오 | 기대 결과 |
|---|---|---|
| 1 | 네이버: state 발급 → 인증 → code 교환 → 로그인 전체 흐름 | 로그인 성공, JWT 발급. P95 3초 이내(SC-009/016) |
| 2 | 네이버: 만료(10분 경과)·재사용 state 로 재시도 | 4xx 거부(1회성 소비·TTL 확인) |
| 3 | `NAVER_REDIRECT_URI` 설정/미설정 각각 토큰 교환 | §4 결정대로 동작, 로그인 성공 |
| 4 | 카카오·구글 로그인 + 자동연동 회귀 | 정상 로그인·자동연동(카카오·구글). 네이버 동일 이메일은 409 |

- 4개 모두 통과하면 소셜 로그인 운영 셋업이 완료된다.
- 실패 시 `apps/backend` 로그(pino → `flyctl logs`)로 provider 응답을 확인한다.
