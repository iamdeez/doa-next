import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../theme/app_theme.dart';

/// 배송지 추가/수정 폼. address 전달 시 수정(PATCH), 미전달 시 추가(POST).
class AddressEditScreen extends ConsumerStatefulWidget {
  const AddressEditScreen({super.key, this.address});
  final Map<String, dynamic>? address;

  @override
  ConsumerState<AddressEditScreen> createState() => _AddressEditScreenState();
}

class _AddressEditScreenState extends ConsumerState<AddressEditScreen> {
  late final TextEditingController _name;
  late final TextEditingController _phone;
  late final TextEditingController _zip;
  late final TextEditingController _addr1;
  late final TextEditingController _addr2;
  bool _isDefault = false;
  bool _loading = false;

  bool get _isEdit => widget.address != null;

  @override
  void initState() {
    super.initState();
    final a = widget.address ?? const {};
    _name = TextEditingController(text: a['recipientName']?.toString() ?? '');
    _phone = TextEditingController(text: a['phone']?.toString() ?? '');
    _zip = TextEditingController(text: a['zipCode']?.toString() ?? '');
    _addr1 = TextEditingController(text: a['address1']?.toString() ?? '');
    _addr2 = TextEditingController(text: a['address2']?.toString() ?? '');
    _isDefault = a['isDefault'] == true;
  }

  @override
  void dispose() {
    for (final c in [_name, _phone, _zip, _addr1, _addr2]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    if (_name.text.trim().isEmpty ||
        _phone.text.trim().isEmpty ||
        _zip.text.trim().isEmpty ||
        _addr1.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('필수 항목을 입력해 주세요.')),
      );
      return;
    }
    setState(() => _loading = true);
    final dio = ref.read(dioProvider);
    final body = {
      'recipientName': _name.text.trim(),
      'phone': _phone.text.trim(),
      'zipCode': _zip.text.trim(),
      'address1': _addr1.text.trim(),
      'address2': _addr2.text.trim(),
      if (!_isEdit) 'isDefault': _isDefault,
    };
    try {
      if (_isEdit) {
        await dio.patch<dynamic>('/users/me/addresses/${widget.address!['id']}', data: body);
        // 수정 화면에서 기본 지정 토글 시 별도 엔드포인트로 반영.
        if (_isDefault && widget.address!['isDefault'] != true) {
          await dio.patch<dynamic>('/users/me/addresses/${widget.address!['id']}/default');
        }
      } else {
        await dio.post<dynamic>('/users/me/addresses', data: body);
      }
      if (!mounted) return;
      Navigator.pop(context, true);
    } on DioException catch (e) {
      if (!mounted) return;
      final msg = e.response?.data is Map ? e.response!.data['message'] : null;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(msg is String ? msg : '저장에 실패했습니다.')),
      );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(_isEdit ? '배송지 수정' : '배송지 추가')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _field('받는 분', _name),
          _field('연락처', _phone, keyboard: TextInputType.phone),
          _field('우편번호', _zip, keyboard: TextInputType.number),
          _field('주소', _addr1),
          _field('상세주소', _addr2, required: false),
          const SizedBox(height: 8),
          CheckboxListTile(
            value: _isDefault,
            onChanged: (v) => setState(() => _isDefault = v ?? false),
            title: const Text('기본 배송지로 설정'),
            controlAffinity: ListTileControlAffinity.leading,
            contentPadding: EdgeInsets.zero,
            activeColor: DoaColors.blue,
          ),
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: _loading ? null : _save,
            child: Text(_loading ? '저장 중…' : '저장'),
          ),
        ],
      ),
    );
  }

  Widget _field(String label, TextEditingController ctrl,
      {TextInputType? keyboard, bool required = true}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Text(label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
            if (required)
              const Text(' *', style: TextStyle(color: DoaColors.danger, fontWeight: FontWeight.w700)),
          ]),
          const SizedBox(height: 6),
          TextField(
            controller: ctrl,
            keyboardType: keyboard,
            decoration: InputDecoration(
              isDense: true,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(DoaRadius.control),
                borderSide: const BorderSide(color: DoaColors.border),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(DoaRadius.control),
                borderSide: const BorderSide(color: DoaColors.border),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
