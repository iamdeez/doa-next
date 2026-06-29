import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/providers.dart';
import '../../theme/app_theme.dart';
import 'order_detail_screen.dart';
import 'order_status.dart';

final _won = NumberFormat('#,###', 'ko_KR');
final _date = DateFormat('yyyy.MM.dd', 'ko_KR');

/// GET /orders — 내 주문 목록 (order-level). 항목 상세는 주문 상세에서.
final ordersProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final res = await ref.read(dioProvider).get<Map<String, dynamic>>(
        '/orders',
        queryParameters: {'limit': 30},
      );
  return ((res.data?['items'] as List?) ?? []).cast<Map<String, dynamic>>();
});

/// 주문/배송 조회 — 목업 "주문/배송 조회" 화면.
class OrderHistoryScreen extends ConsumerStatefulWidget {
  const OrderHistoryScreen({super.key});
  @override
  ConsumerState<OrderHistoryScreen> createState() => _OrderHistoryScreenState();
}

class _OrderHistoryScreenState extends ConsumerState<OrderHistoryScreen> {
  String _statusFilter = 'all';

  @override
  Widget build(BuildContext context) {
    final orders = ref.watch(ordersProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('주문/배송 조회')),
      body: Column(
        children: [
          _filterBar(),
          Expanded(
            child: orders.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(child: Text('주문을 불러오지 못했습니다.\n$e',
                  textAlign: TextAlign.center, style: const TextStyle(color: DoaColors.fgMuted))),
              data: (all) {
                final items = _statusFilter == 'all'
                    ? all
                    : all.where((o) => o['status'] == _statusFilter).toList();
                if (items.isEmpty) {
                  return const Center(
                    child: Text('주문 내역이 없습니다.', style: TextStyle(color: DoaColors.fgMuted)),
                  );
                }
                return RefreshIndicator(
                  onRefresh: () => ref.refresh(ordersProvider.future),
                  child: ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: items.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 12),
                    itemBuilder: (_, i) => _OrderCard(order: items[i]),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _filterBar() {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
      color: DoaColors.surface,
      child: Row(
        children: [
          _dropdown(
            value: _statusFilter,
            items: const {
              'all': '주문 상태 전체',
              'preparing': '상품준비',
              'shipped': '배송중',
              'delivered': '배송완료',
              'completed': '구매확정',
              'cancelled': '주문취소',
            },
            onChanged: (v) => setState(() => _statusFilter = v),
          ),
        ],
      ),
    );
  }

  Widget _dropdown({
    required String value,
    required Map<String, String> items,
    required ValueChanged<String> onChanged,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 2),
      decoration: BoxDecoration(
        border: Border.all(color: DoaColors.border),
        borderRadius: BorderRadius.circular(DoaRadius.pill),
      ),
      child: DropdownButton<String>(
        value: value,
        isDense: true,
        underline: const SizedBox(),
        icon: const Icon(Icons.keyboard_arrow_down, size: 20, color: DoaColors.fgMuted),
        style: const TextStyle(fontSize: 13, color: DoaColors.fg),
        items: [
          for (final e in items.entries)
            DropdownMenuItem(value: e.key, child: Text(e.value)),
        ],
        onChanged: (v) => v != null ? onChanged(v) : null,
      ),
    );
  }
}

class _OrderCard extends StatelessWidget {
  const _OrderCard({required this.order});
  final Map<String, dynamic> order;

  @override
  Widget build(BuildContext context) {
    final status = order['status'] as String? ?? 'pending';
    final tone = orderStatusTone(status);
    final created = DateTime.tryParse(order['createdAt']?.toString() ?? '');
    final total = num.tryParse(order['totalAmount']?.toString() ?? '0') ?? 0;

    return InkWell(
      onTap: () => Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => OrderDetailScreen(orderId: order['id'] as String)),
      ),
      borderRadius: BorderRadius.circular(DoaRadius.card),
      child: Container(
        padding: const EdgeInsets.all(16),
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
                if (created != null)
                  Text(_date.format(created),
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(color: tone.bg, borderRadius: BorderRadius.circular(DoaRadius.pill)),
                  child: Text(orderStatusText(status),
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: tone.fg)),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Text('${_won.format(total)}원',
                    style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
                const Spacer(),
                const Text('상세보기', style: TextStyle(fontSize: 13, color: DoaColors.fgMuted)),
                const Icon(Icons.chevron_right, size: 18, color: DoaColors.fgSubtle),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
