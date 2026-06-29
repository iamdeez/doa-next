import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/providers.dart';
import '../../theme/app_theme.dart';

final _won = NumberFormat('#,###', 'ko_KR');

final cartProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final res = await ref.read(dioProvider).get<Map<String, dynamic>>('/cart');
  return ((res.data?['items'] as List?) ?? []).cast<Map<String, dynamic>>();
});

class CartScreen extends ConsumerWidget {
  const CartScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cart = ref.watch(cartProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('장바구니')),
      body: cart.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('장바구니를 불러오지 못했습니다.\n$e')),
        data: (items) {
          if (items.isEmpty) {
            return const Center(
              child: Text('장바구니가 비어 있습니다.', style: TextStyle(color: DoaColors.fgMuted)),
            );
          }
          final total = items.fold<num>(
            0,
            (sum, it) => sum + (num.tryParse(it['unitPrice'].toString()) ?? 0) * (it['quantity'] as num),
          );
          return Column(
            children: [
              Expanded(
                child: ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: items.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 12),
                  itemBuilder: (_, i) => _CartRow(item: items[i], onChanged: () => ref.invalidate(cartProvider)),
                ),
              ),
              _Checkout(total: total),
            ],
          );
        },
      ),
    );
  }
}

class _CartRow extends ConsumerWidget {
  const _CartRow({required this.item, required this.onChanged});
  final Map<String, dynamic> item;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dio = ref.read(dioProvider);
    final variantId = item['variantId'] as String;
    final qty = item['quantity'] as num;
    final unit = num.tryParse(item['unitPrice'].toString()) ?? 0;

    Future<void> setQty(int next) async {
      if (next < 1) return;
      await dio.put<dynamic>('/cart/items/$variantId', data: {'quantity': next});
      onChanged();
    }

    Future<void> remove() async {
      await dio.delete<dynamic>('/cart/items/$variantId');
      onChanged();
    }

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: DoaColors.surface,
        borderRadius: BorderRadius.circular(DoaRadius.card),
        border: Border.all(color: DoaColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(item['productTitle'] as String? ?? '',
                    maxLines: 2, overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w600)),
              ),
              InkWell(onTap: remove, child: const Icon(Icons.close, size: 18, color: DoaColors.fgSubtle)),
            ],
          ),
          const SizedBox(height: 4),
          Text('${item['optionName']} · ${item['optionValue']}',
              style: const TextStyle(color: DoaColors.fgMuted, fontSize: 13)),
          const SizedBox(height: 10),
          Row(
            children: [
              _step(Icons.remove, () => setQty((qty - 1).toInt())),
              SizedBox(width: 36, child: Center(child: Text('$qty'))),
              _step(Icons.add, () => setQty((qty + 1).toInt())),
              const Spacer(),
              Text('${_won.format(unit * qty)}원',
                  style: const TextStyle(fontWeight: FontWeight.w800)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _step(IconData icon, VoidCallback onTap) => InkWell(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(5),
          decoration: BoxDecoration(border: Border.all(color: DoaColors.border), borderRadius: BorderRadius.circular(6)),
          child: Icon(icon, size: 16),
        ),
      );
}

class _Checkout extends StatelessWidget {
  const _Checkout({required this.total});
  final num total;
  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: const BoxDecoration(
          color: DoaColors.surface,
          border: Border(top: BorderSide(color: DoaColors.border)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                const Text('총 금액', style: TextStyle(fontWeight: FontWeight.w700)),
                const Spacer(),
                Text('${_won.format(total)}원',
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: DoaColors.blue)),
              ],
            ),
            const SizedBox(height: 12),
            ElevatedButton(
              onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('배송지·결제(체크아웃)는 다음 단계에서 구현됩니다.')),
              ),
              child: const Text('주문하기'),
            ),
          ],
        ),
      ),
    );
  }
}
