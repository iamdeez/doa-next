import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../theme/app_theme.dart';
import 'find_email_screen.dart';
import 'forgot_password_screen.dart';
import 'social_auth_service.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});
  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _obscure = true;
  bool _autoLogin = false;
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await ref.read(authControllerProvider.notifier).login(_email.text.trim(), _password.text);
    } on DioException catch (e) {
      final msg = e.response?.data is Map ? (e.response!.data['message']) : null;
      setState(() => _error = msg is String ? msg : '로그인에 실패했습니다.');
    } catch (_) {
      setState(() => _error = '로그인에 실패했습니다.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _socialLogin(Future<SocialCredential> Function() getCredential) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final credential = await getCredential();
      await ref
          .read(authControllerProvider.notifier)
          .socialLogin(credential.provider, credential.token, state: credential.state);
    } on SocialAuthCancelled {
      // 사용자 취소 — 에러 표시 없이 복구
    } on DioException catch (e) {
      final msg = e.response?.data is Map ? (e.response!.data['message']) : null;
      setState(() => _error = msg is String ? msg : '소셜 로그인에 실패했습니다.');
    } catch (_) {
      setState(() => _error = '소셜 로그인에 실패했습니다.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final socialService = ref.read(socialAuthServiceProvider);

    return Scaffold(
      backgroundColor: DoaColors.surface,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            children: [
              const SizedBox(height: 80),
              Text(
                'DOA',
                style: TextStyle(
                  fontSize: 48,
                  fontWeight: FontWeight.w900,
                  color: DoaColors.blue,
                  letterSpacing: -1,
                ),
              ),
              const SizedBox(height: 56),
              TextField(
                controller: _email,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(hintText: '이메일을 입력해주세요.'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _password,
                obscureText: _obscure,
                decoration: InputDecoration(
                  hintText: '비밀번호를 입력해 주세요.',
                  suffixIcon: IconButton(
                    icon: Icon(_obscure ? Icons.visibility_off : Icons.visibility,
                        color: DoaColors.fgSubtle),
                    onPressed: () => setState(() => _obscure = !_obscure),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  SizedBox(
                    width: 24,
                    height: 24,
                    child: Checkbox(
                      value: _autoLogin,
                      onChanged: (v) => setState(() => _autoLogin = v ?? false),
                    ),
                  ),
                  const SizedBox(width: 8),
                  const Text('자동 로그인'),
                ],
              ),
              if (_error != null) ...[
                const SizedBox(height: 8),
                Align(
                  alignment: Alignment.centerLeft,
                  child: Text(_error!, style: const TextStyle(color: DoaColors.danger, fontSize: 13)),
                ),
              ],
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: _loading ? null : _submit,
                child: _loading
                    ? const SizedBox(
                        width: 20, height: 20,
                        child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                    : const Text('로그인'),
              ),
              const SizedBox(height: 20),
              const _LinkRow(),
              const SizedBox(height: 32),
              const Text('간편 로그인', style: TextStyle(color: DoaColors.fgMuted, fontSize: 13)),
              const SizedBox(height: 16),
              _SocialRow(
                onKakao: _loading ? null : () => _socialLogin(socialService.signInWithKakao),
                onGoogle: _loading ? null : () => _socialLogin(socialService.signInWithGoogle),
                onNaver: _loading ? null : () => _socialLogin(socialService.signInWithNaver),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _LinkRow extends StatelessWidget {
  const _LinkRow();
  @override
  Widget build(BuildContext context) {
    const style = TextStyle(color: DoaColors.fg, fontSize: 13, fontWeight: FontWeight.w600);
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        GestureDetector(
          onTap: () => Navigator.push(
              context, MaterialPageRoute(builder: (_) => const FindEmailScreen())),
          child: const Text('이메일 찾기', style: style),
        ),
        const _Dot(),
        GestureDetector(
          onTap: () => Navigator.push(
              context, MaterialPageRoute(builder: (_) => const ForgotPasswordScreen())),
          child: const Text('비밀번호 찾기', style: style),
        ),
        const _Dot(),
        const Text('회원가입', style: style),
      ],
    );
  }
}

class _Dot extends StatelessWidget {
  const _Dot();
  @override
  Widget build(BuildContext context) => const Padding(
        padding: EdgeInsets.symmetric(horizontal: 10),
        child: Text('|', style: TextStyle(color: DoaColors.border)),
      );
}

class _SocialRow extends StatelessWidget {
  final VoidCallback? onKakao;
  final VoidCallback? onGoogle;
  final VoidCallback? onNaver;

  const _SocialRow({
    required this.onKakao,
    required this.onGoogle,
    required this.onNaver,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        GestureDetector(
          onTap: onKakao,
          child: _social(const Color(0xFFFEE500), const Text('💬', style: TextStyle(fontSize: 22))),
        ),
        const SizedBox(width: 20),
        GestureDetector(
          onTap: onGoogle,
          child: _social(
            Colors.white,
            const Text('G', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
            border: true,
          ),
        ),
        const SizedBox(width: 20),
        GestureDetector(
          onTap: onNaver,
          child: _social(
            const Color(0xFF03C75A),
            const Text(
              'N',
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Colors.white),
            ),
          ),
        ),
      ],
    );
  }

  Widget _social(Color bg, Widget child, {bool border = false}) => Container(
        width: 52,
        height: 52,
        decoration: BoxDecoration(
          color: bg,
          shape: BoxShape.circle,
          border: border ? Border.all(color: DoaColors.border) : null,
        ),
        child: Center(child: child),
      );
}
