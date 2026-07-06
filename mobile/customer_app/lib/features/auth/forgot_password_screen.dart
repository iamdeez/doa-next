import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../theme/app_theme.dart';

/// 비밀번호 찾기 — 이메일 입력 → OTP 전송 → OTP+새 비밀번호 입력 → 변경 완료 → LoginScreen
///
/// Step 1: 이메일 입력 → POST /auth/forgot-password (SC-015, SC-016)
/// Step 2: OTP+새 비밀번호 입력 → POST /auth/reset-password (SC-017, SC-018)
/// 재전송 버튼: 60초 비활성 타이머 (SC-019, NFR-003)
class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  ConsumerState<ForgotPasswordScreen> createState() =>
      _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailCtrl = TextEditingController();
  final _otpCtrl = TextEditingController();
  final _pwCtrl = TextEditingController();

  bool _step1Done = false; // true → OTP 입력 단계
  bool _loading = false;
  String? _error;

  // 재전송 60초 쿨다운 (SC-019)
  int _cooldown = 0;
  Timer? _timer;

  @override
  void dispose() {
    _emailCtrl.dispose();
    _otpCtrl.dispose();
    _pwCtrl.dispose();
    _timer?.cancel();
    super.dispose();
  }

  void _startCooldown() {
    _cooldown = 60;
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) {
        t.cancel();
        return;
      }
      setState(() => _cooldown--);
      if (_cooldown <= 0) t.cancel();
    });
  }

  Future<void> _sendOtp() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final dio = ref.read(dioProvider);
      await dio.post<void>(
        '/auth/forgot-password',
        data: {'email': _emailCtrl.text.trim()},
        options: Options(extra: {'anonymous': true}),
      );
      setState(() => _step1Done = true);
      _startCooldown();
    } on DioException catch (e) {
      final status = e.response?.statusCode;
      if (status == 404) {
        setState(() => _error = '등록되지 않은 이메일입니다.');
      } else if (status == 429) {
        setState(() => _error = '1분 후 다시 시도해주세요.');
        _startCooldown();
      } else {
        setState(() => _error = '전송에 실패했습니다. 잠시 후 다시 시도해주세요.');
      }
    } catch (_) {
      setState(() => _error = '전송에 실패했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _resetPassword() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final dio = ref.read(dioProvider);
      await dio.post<void>(
        '/auth/reset-password',
        data: {
          'email': _emailCtrl.text.trim(),
          'otp': _otpCtrl.text.trim(),
          'newPassword': _pwCtrl.text,
        },
        options: Options(extra: {'anonymous': true}),
      );
      if (mounted) {
        Navigator.of(context).popUntil((route) => route.isFirst);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('비밀번호가 변경되었습니다. 다시 로그인해주세요.')),
        );
      }
    } on DioException catch (e) {
      final status = e.response?.statusCode;
      if (status == 400) {
        setState(
            () => _error = '인증코드가 올바르지 않거나 만료되었습니다. 다시 시도해주세요.');
      } else {
        setState(() => _error = '비밀번호 변경에 실패했습니다.');
      }
    } catch (_) {
      setState(() => _error = '비밀번호 변경에 실패했습니다.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('비밀번호 찾기')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            const Text(
              '가입한 이메일 주소를 입력하면\n인증코드를 전송해드립니다.',
              style: TextStyle(fontSize: 14, color: DoaColors.fgMuted, height: 1.5),
            ),
            const SizedBox(height: 24),
            TextFormField(
              controller: _emailCtrl,
              keyboardType: TextInputType.emailAddress,
              readOnly: _step1Done,
              decoration: const InputDecoration(hintText: '이메일'),
              validator: (v) =>
                  (v == null || !v.contains('@')) ? '올바른 이메일을 입력해주세요.' : null,
            ),
            const SizedBox(height: 12),
            if (!_step1Done) ...[
              ElevatedButton(
                onPressed: _loading ? null : _sendOtp,
                child: _loading
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                            color: Colors.white, strokeWidth: 2),
                      )
                    : const Text('OTP 전송'),
              ),
            ],
            if (_step1Done) ...[
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _otpCtrl,
                      keyboardType: TextInputType.number,
                      maxLength: 6,
                      decoration: const InputDecoration(
                          hintText: '인증코드 6자리', counterText: ''),
                      validator: (v) =>
                          (v == null || v.length != 6) ? '6자리 코드를 입력해주세요.' : null,
                    ),
                  ),
                  const SizedBox(width: 8),
                  // 재전송 버튼 — 60초 비활성 (SC-019)
                  TextButton(
                    onPressed: _cooldown > 0
                        ? null
                        : () {
                            _otpCtrl.clear();
                            _sendOtp();
                          },
                    child: Text(
                      _cooldown > 0 ? '재전송 ($_cooldown)' : '재전송',
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _pwCtrl,
                obscureText: true,
                decoration: const InputDecoration(hintText: '새 비밀번호 (8자 이상)'),
                validator: (v) =>
                    (v == null || v.length < 8) ? '8자 이상 입력해주세요.' : null,
              ),
              const SizedBox(height: 20),
              ElevatedButton(
                onPressed: _loading ? null : _resetPassword,
                child: _loading
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                            color: Colors.white, strokeWidth: 2),
                      )
                    : const Text('비밀번호 변경'),
              ),
            ],
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!,
                  style:
                      const TextStyle(color: DoaColors.danger, fontSize: 13)),
            ],
          ],
        ),
      ),
    );
  }
}
