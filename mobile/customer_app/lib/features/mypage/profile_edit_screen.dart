import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../theme/app_theme.dart';

/// 개인정보 수정 화면 — PATCH /users/me (name·phone)
class ProfileEditScreen extends ConsumerStatefulWidget {
  const ProfileEditScreen({super.key});

  @override
  ConsumerState<ProfileEditScreen> createState() => _ProfileEditScreenState();
}

class _ProfileEditScreenState extends ConsumerState<ProfileEditScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _phone = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadProfile();
  }

  Future<void> _loadProfile() async {
    try {
      final dio = ref.read(dioProvider);
      final res = await dio.get<Map<String, dynamic>>('/users/me');
      final data = res.data ?? {};
      _name.text = (data['name'] as String?) ?? '';
      _phone.text = (data['phone'] as String?) ?? '';
    } catch (_) {
      // 불러오기 실패 시 빈 값으로 시작
    }
  }

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final dio = ref.read(dioProvider);
      await dio.patch<void>('/users/me', data: {
        'name': _name.text.trim(),
        'phone': _phone.text.trim(),
      });
      if (mounted) Navigator.pop(context);
    } on DioException catch (e) {
      final msg = e.response?.data is Map ? (e.response!.data['message']) : null;
      setState(() => _error = msg is String ? msg : '저장에 실패했습니다.');
    } catch (_) {
      setState(() => _error = '저장에 실패했습니다.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('개인정보 수정')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            const Text('이름', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            TextFormField(
              controller: _name,
              decoration: const InputDecoration(hintText: '이름을 입력해주세요.'),
              validator: (v) => (v == null || v.trim().isEmpty) ? '이름을 입력해주세요.' : null,
            ),
            const SizedBox(height: 20),
            const Text('휴대폰 번호', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            TextFormField(
              controller: _phone,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(hintText: '010XXXXXXXX'),
              validator: (v) {
                if (v == null || v.trim().isEmpty) return '휴대폰 번호를 입력해주세요.';
                if (!RegExp(r'^01[0-9]{8,9}$').hasMatch(v.trim())) {
                  return '올바른 휴대폰 번호를 입력해주세요.';
                }
                return null;
              },
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!, style: const TextStyle(color: DoaColors.danger, fontSize: 13)),
            ],
            const SizedBox(height: 32),
            ElevatedButton(
              onPressed: _loading ? null : _submit,
              child: _loading
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                    )
                  : const Text('저장'),
            ),
          ],
        ),
      ),
    );
  }
}
