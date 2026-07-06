import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../theme/app_theme.dart';

/// 이메일 찾기 — 휴대폰 번호 입력 → 마스킹된 이메일 표시 (SC-021~SC-024)
///
/// POST /auth/find-email body: { phone } → 200 { email: "us**@example.com" }
/// 미가입 → 404 (SC-023)
class FindEmailScreen extends ConsumerStatefulWidget {
  const FindEmailScreen({super.key});

  @override
  ConsumerState<FindEmailScreen> createState() => _FindEmailScreenState();
}

class _FindEmailScreenState extends ConsumerState<FindEmailScreen> {
  final _formKey = GlobalKey<FormState>();
  final _phoneCtrl = TextEditingController();
  bool _loading = false;
  String? _error;
  String? _foundEmail;

  @override
  void dispose() {
    _phoneCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _loading = true;
      _error = null;
      _foundEmail = null;
    });
    try {
      final dio = ref.read(dioProvider);
      final res = await dio.post<Map<String, dynamic>>(
        '/auth/find-email',
        data: {'phone': _phoneCtrl.text.trim()},
        options: Options(extra: {'anonymous': true}),
      );
      final email = res.data?['email'] as String?;
      setState(() => _foundEmail = email);
    } on DioException catch (e) {
      final status = e.response?.statusCode;
      if (status == 404) {
        setState(() => _error = '해당 번호로 가입된 계정이 없습니다.');
      } else {
        setState(() => _error = '이메일을 찾지 못했습니다. 다시 시도해주세요.');
      }
    } catch (_) {
      setState(() => _error = '이메일을 찾지 못했습니다. 다시 시도해주세요.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('이메일 찾기')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            const Text(
              '가입 시 등록한 휴대폰 번호를 입력해주세요.',
              style: TextStyle(fontSize: 14, color: DoaColors.fgMuted),
            ),
            const SizedBox(height: 24),
            TextFormField(
              controller: _phoneCtrl,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(hintText: '010XXXXXXXX'),
              validator: (v) {
                if (v == null || v.trim().isEmpty) return '휴대폰 번호를 입력해주세요.';
                if (!RegExp(r'^01[0-9]{8,9}$').hasMatch(v.trim())) {
                  return '올바른 휴대폰 번호 형식으로 입력해주세요.';
                }
                return null;
              },
            ),
            const SizedBox(height: 20),
            ElevatedButton(
              onPressed: _loading ? null : _submit,
              child: _loading
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                          color: Colors.white, strokeWidth: 2),
                    )
                  : const Text('이메일 찾기'),
            ),
            if (_error != null) ...[
              const SizedBox(height: 16),
              Text(_error!,
                  style:
                      const TextStyle(color: DoaColors.danger, fontSize: 13)),
            ],
            if (_foundEmail != null) ...[
              const SizedBox(height: 24),
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: DoaColors.blueSoft,
                  borderRadius: BorderRadius.circular(DoaRadius.card),
                ),
                child: Column(
                  children: [
                    const Text('가입된 이메일',
                        style: TextStyle(
                            fontSize: 13, color: DoaColors.fgMuted)),
                    const SizedBox(height: 8),
                    Text(
                      _foundEmail!,
                      style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                          color: DoaColors.blue),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              OutlinedButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('로그인하러 가기'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
