import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/providers.dart';
import '../../theme/app_theme.dart';

final _won = NumberFormat('#,###', 'ko_KR');

/// 구매후기 작성 — 목업 "구매후기작성". 주문 항목(orderItem) 기준.
/// POST /reviews { orderItemId, rating(1~5), content }.
class ReviewWriteScreen extends ConsumerStatefulWidget {
  const ReviewWriteScreen({super.key, required this.orderItem});

  /// 주문 상세의 item 맵(id=orderItemId, productTitle, optionValue, quantity, unitPrice).
  final Map<String, dynamic> orderItem;

  @override
  ConsumerState<ReviewWriteScreen> createState() => _ReviewWriteScreenState();
}

class _ReviewWriteScreenState extends ConsumerState<ReviewWriteScreen> {
  int _rating = 5;
  final _ctrl = TextEditingController();
  bool _loading = false;

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final content = _ctrl.text.trim();
    if (content.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('구매후기 내용을 입력해 주세요.')),
      );
      return;
    }
    setState(() => _loading = true);
    try {
      await ref.read(dioProvider).post<dynamic>('/reviews', data: {
        'orderItemId': widget.orderItem['id'],
        'rating': _rating,
        'content': content,
      });
      if (!mounted) return;
      Navigator.pop(context, true);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('구매후기가 등록되었습니다.')),
      );
    } on DioException catch (e) {
      if (!mounted) return;
      final msg = e.response?.data is Map ? e.response!.data['message'] : null;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(msg is String ? msg : '후기 등록에 실패했습니다.')),
      );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final it = widget.orderItem;
    final qty = num.tryParse(it['quantity']?.toString() ?? '1') ?? 1;
    final unit = num.tryParse(it['unitPrice']?.toString() ?? '0') ?? 0;

    return Scaffold(
      appBar: AppBar(title: const Text('구매후기작성')),
      body: ListView(
        children: [
          Container(
            margin: const EdgeInsets.all(16),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: DoaColors.muted,
              borderRadius: BorderRadius.circular(DoaRadius.card),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(it['productTitle']?.toString() ?? '',
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, height: 1.3)),
                const SizedBox(height: 8),
                Text('${it['optionValue'] ?? ''}',
                    style: const TextStyle(color: DoaColors.fgMuted, fontSize: 13)),
                const SizedBox(height: 6),
                Row(
                  children: [
                    Text('${_won.format(unit * qty)}원',
                        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                    const SizedBox(width: 10),
                    const Text('|', style: TextStyle(color: DoaColors.border)),
                    const SizedBox(width: 10),
                    Text('$qty' '개', style: const TextStyle(color: DoaColors.fgMuted, fontSize: 13)),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          const Center(child: Text('별점', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800))),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              for (var i = 1; i <= 5; i++)
                IconButton(
                  onPressed: () => setState(() => _rating = i),
                  icon: Icon(
                    i <= _rating ? Icons.star : Icons.star_border,
                    color: i <= _rating ? DoaColors.star : DoaColors.fgSubtle,
                    size: 36,
                  ),
                ),
            ],
          ),
          const Divider(height: 32, indent: 20, endIndent: 20),
          const Center(child: Text('구매후기', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800))),
          const SizedBox(height: 12),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: TextField(
              controller: _ctrl,
              maxLines: 8,
              decoration: InputDecoration(
                hintText: '내용을 입력해주세요.',
                hintStyle: const TextStyle(color: DoaColors.fgSubtle),
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
          ),
          const SizedBox(height: 24),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: ElevatedButton(
              onPressed: _loading ? null : _submit,
              child: Text(_loading ? '등록 중…' : '후기 등록'),
            ),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}
