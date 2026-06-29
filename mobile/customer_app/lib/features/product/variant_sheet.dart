import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/providers.dart';
import '../../theme/app_theme.dart';
import '../cart/cart_screen.dart';

final _won = NumberFormat('#,###', 'ko_KR');

void showVariantSheet(BuildContext context, Map<String, dynamic> product, {required bool buyNow}) {
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: DoaColors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => _VariantSheet(product: product, buyNow: buyNow),
  );
}

class _VariantSheet extends ConsumerStatefulWidget {
  const _VariantSheet({required this.product, required this.buyNow});
  final Map<String, dynamic> product;
  final bool buyNow;
  @override
  ConsumerState<_VariantSheet> createState() => _VariantSheetState();
}

class _VariantSheetState extends ConsumerState<_VariantSheet> {
  String? _variantId;
  int _qty = 1;
  bool _loading = false;

  List<Map<String, dynamic>> get _variants =>
      ((widget.product['variants'] as List?) ?? []).cast<Map<String, dynamic>>();

  Map<String, dynamic>? get _selected =>
      _variants.where((v) => v['id'] == _variantId).firstOrNull;

  num get _unit => num.tryParse(
        (_selected?['price'] ?? widget.product['price'] ?? '0').toString(),
      ) ??
      0;

  Future<void> _addToCart() async {
    if (_variantId == null) return;
    setState(() => _loading = true);
    try {
      await ref.read(dioProvider).post<dynamic>('/cart/items',
          data: {'variantId': _variantId, 'quantity': _qty});
      if (!mounted) return;
      Navigator.pop(context);
      if (widget.buyNow) {
        Navigator.push(context, MaterialPageRoute(builder: (_) => const CartScreen()));
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('장바구니에 담았습니다.')),
        );
      }
    } on DioException catch (e) {
      if (!mounted) return;
      final msg = e.response?.data is Map ? e.response!.data['message'] : null;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(msg is String ? msg : '담기에 실패했습니다.')),
      );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 16),
            const Padding(
              padding: EdgeInsets.fromLTRB(20, 0, 20, 12),
              child: Text.rich(TextSpan(children: [
                TextSpan(text: '(필수) ', style: TextStyle(color: DoaColors.blue, fontWeight: FontWeight.w700)),
                TextSpan(text: '옵션', style: TextStyle(fontWeight: FontWeight.w700)),
              ])),
            ),
            ConstrainedBox(
              constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.4),
              child: ListView(
                shrinkWrap: true,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                children: [
                  if (_variants.isEmpty)
                    const Padding(padding: EdgeInsets.all(16), child: Text('옵션이 없습니다.', style: TextStyle(color: DoaColors.fgMuted)))
                  else
                    for (final v in _variants) _variantTile(v),
                ],
              ),
            ),
            if (_selected != null) _selectedRow(),
            const Divider(height: 24),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Row(
                children: [
                  const Text('총 금액', style: TextStyle(fontWeight: FontWeight.w700)),
                  const Spacer(),
                  Text('${_won.format(_unit * _qty)}원',
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: DoaColors.blue)),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: ElevatedButton(
                onPressed: (_variantId == null || _loading) ? null : _addToCart,
                child: Text(_loading ? '처리 중…' : (widget.buyNow ? '구매하기' : '장바구니 담기')),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _variantTile(Map<String, dynamic> v) {
    final selected = v['id'] == _variantId;
    final name = '${v['optionName'] ?? ''} · ${v['optionValue'] ?? ''}';
    return InkWell(
      onTap: () => setState(() {
        _variantId = v['id'] as String;
        _qty = 1;
      }),
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        decoration: BoxDecoration(
          border: Border.all(color: selected ? DoaColors.blue : DoaColors.border),
          borderRadius: BorderRadius.circular(DoaRadius.control),
        ),
        child: Row(
          children: [
            Icon(selected ? Icons.check_box : Icons.check_box_outline_blank,
                color: selected ? DoaColors.blue : DoaColors.fgSubtle, size: 20),
            const SizedBox(width: 10),
            Expanded(child: Text(name)),
          ],
        ),
      ),
    );
  }

  Widget _selectedRow() {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: DoaColors.muted, borderRadius: BorderRadius.circular(DoaRadius.control)),
      child: Row(
        children: [
          Expanded(child: Text('${_selected!['optionValue'] ?? ''}', style: const TextStyle(fontWeight: FontWeight.w600))),
          _stepBtn(Icons.remove, () => setState(() => _qty = (_qty - 1).clamp(1, 999))),
          SizedBox(width: 32, child: Center(child: Text('$_qty'))),
          _stepBtn(Icons.add, () => setState(() => _qty++)),
          const SizedBox(width: 12),
          Text('${_won.format(_unit * _qty)}원', style: const TextStyle(fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }

  Widget _stepBtn(IconData icon, VoidCallback onTap) => InkWell(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(4),
          decoration: BoxDecoration(border: Border.all(color: DoaColors.border), borderRadius: BorderRadius.circular(6)),
          child: Icon(icon, size: 16),
        ),
      );
}
