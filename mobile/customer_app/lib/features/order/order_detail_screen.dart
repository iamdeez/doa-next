import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/providers.dart';
import '../../theme/app_theme.dart';
import '../review/review_write_screen.dart';
import 'delivery_tracking_screen.dart';
import 'order_status.dart';

final _won = NumberFormat('#,###', 'ko_KR');
final _date = DateFormat('yyyy.MM.dd HH:mm', 'ko_KR');

/// GET /orders/:id — 주문 상세 (items + 배송지 + 금액).
final orderDetailProvider =
    FutureProvider.autoDispose.family<Map<String, dynamic>, String>((ref, id) async {
  final res = await ref.read(dioProvider).get<Map<String, dynamic>>('/orders/$id');
  return res.data ?? {};
});

class OrderDetailScreen extends ConsumerWidget {
  const OrderDetailScreen({super.key, required this.orderId});
  final String orderId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detail = ref.watch(orderDetailProvider(orderId));
    return Scaffold(
      appBar: AppBar(title: const Text('주문 상세')),
      body: detail.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('주문을 불러오지 못했습니다.\n$e',
            textAlign: TextAlign.center, style: const TextStyle(color: DoaColors.fgMuted))),
        data: (order) {
          final status = order['status'] as String? ?? 'pending';
          final tone = orderStatusTone(status);
          final items = ((order['items'] as List?) ?? []).cast<Map<String, dynamic>>();
          final created = DateTime.tryParse(order['createdAt']?.toString() ?? '');
          final addr = (order['shippingAddressSnapshot'] as Map?)?.cast<String, dynamic>() ?? {};
          final total = num.tryParse(order['totalAmount']?.toString() ?? '0') ?? 0;
          final discount = num.tryParse(order['discountAmount']?.toString() ?? '0') ?? 0;

          return ListView(
            children: [
              Container(
                color: DoaColors.surface,
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (created != null)
                          Text(_date.format(created),
                              style: const TextStyle(fontSize: 13, color: DoaColors.fgMuted)),
                        const SizedBox(height: 4),
                        Text('주문번호 ${orderId.substring(0, 8).toUpperCase()}',
                            style: const TextStyle(fontSize: 12, color: DoaColors.fgSubtle)),
                      ],
                    ),
                    const Spacer(),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(color: tone.bg, borderRadius: BorderRadius.circular(DoaRadius.pill)),
                      child: Text(orderStatusText(status),
                          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: tone.fg)),
                    ),
                  ],
                ),
              ),
              const Divider(height: 8, thickness: 8, color: DoaColors.canvas),
              _sectionTitle('주문 상품'),
              for (final it in items) _itemRow(context, it, status),
              _DeliveryButton(orderId: orderId, status: status),
              const Divider(height: 8, thickness: 8, color: DoaColors.canvas),
              _sectionTitle('배송지'),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(addr['recipientName']?.toString() ?? '-',
                        style: const TextStyle(fontWeight: FontWeight.w700)),
                    const SizedBox(height: 4),
                    Text('${addr['address1'] ?? ''} ${addr['address2'] ?? ''}',
                        style: const TextStyle(color: DoaColors.fgMuted, fontSize: 13)),
                    Text(addr['phone']?.toString() ?? '',
                        style: const TextStyle(color: DoaColors.fgSubtle, fontSize: 12)),
                  ],
                ),
              ),
              const Divider(height: 8, thickness: 8, color: DoaColors.canvas),
              _sectionTitle('결제 정보'),
              _amountRow('상품 금액', total + discount),
              if (discount > 0) _amountRow('할인', -discount),
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 16),
                child: Divider(height: 24),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                child: Row(
                  children: [
                    const Text('총 결제 금액', style: TextStyle(fontWeight: FontWeight.w800)),
                    const Spacer(),
                    Text('${_won.format(total)}원',
                        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: DoaColors.blue)),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _sectionTitle(String t) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
        child: Text(t, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
      );

  Widget _itemRow(BuildContext context, Map<String, dynamic> it, String status) {
    final qty = num.tryParse(it['quantity']?.toString() ?? '1') ?? 1;
    final unit = num.tryParse(it['unitPrice']?.toString() ?? '0') ?? 0;
    // 배송완료/구매확정 항목만 후기 작성 가능 (FR-021 — 배송완료 후 작성).
    final reviewable = status == 'delivered' || status == 'completed';
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
      child: Column(
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 56, height: 56,
                decoration: BoxDecoration(color: DoaColors.muted, borderRadius: BorderRadius.circular(DoaRadius.control)),
                child: const Icon(Icons.image_outlined, color: DoaColors.fgSubtle, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(it['productTitle']?.toString() ?? '',
                        maxLines: 2, overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 14)),
                    const SizedBox(height: 4),
                    Text('${it['optionValue'] ?? ''} · $qty' '개',
                        style: const TextStyle(color: DoaColors.fgMuted, fontSize: 12)),
                    const SizedBox(height: 4),
                    Text('${_won.format(unit * qty)}원',
                        style: const TextStyle(fontWeight: FontWeight.w800)),
                  ],
                ),
              ),
            ],
          ),
          if (reviewable)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: () => Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => ReviewWriteScreen(orderItem: it)),
                  ),
                  child: const Text('구매후기 작성'),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _amountRow(String label, num value) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 6, 16, 6),
        child: Row(
          children: [
            Text(label, style: const TextStyle(color: DoaColors.fgMuted, fontSize: 13)),
            const Spacer(),
            Text('${value < 0 ? '-' : ''}${_won.format(value.abs())}원',
                style: const TextStyle(fontSize: 13)),
          ],
        ),
      );
}

/// 배송조회 버튼 — GET /shipments?orderId= 로 송장 조회 후 추적 화면 진입.
class _DeliveryButton extends ConsumerStatefulWidget {
  const _DeliveryButton({required this.orderId, required this.status});
  final String orderId;
  final String status;
  @override
  ConsumerState<_DeliveryButton> createState() => _DeliveryButtonState();
}

class _DeliveryButtonState extends ConsumerState<_DeliveryButton> {
  bool _loading = false;

  Future<void> _open() async {
    setState(() => _loading = true);
    try {
      final res = await ref.read(dioProvider).get<Map<String, dynamic>>(
            '/shipments',
            queryParameters: {'orderId': widget.orderId},
          );
      final shipment = res.data;
      if (!mounted) return;
      if (shipment == null || shipment['id'] == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('아직 배송 정보가 등록되지 않았습니다.')),
        );
        return;
      }
      Navigator.push(context,
          MaterialPageRoute(builder: (_) => DeliveryTrackingScreen(shipment: shipment)));
    } on DioException {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('배송 정보를 불러오지 못했습니다.')),
      );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    // 배송 단계 진입 전(pending/confirmed/cancelled)에는 노출하지 않음.
    const trackable = {'preparing', 'shipped', 'delivered', 'completed'};
    if (!trackable.contains(widget.status)) return const SizedBox(height: 8);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      child: OutlinedButton(
        onPressed: _loading ? null : _open,
        child: Text(_loading ? '조회 중…' : '배송조회'),
      ),
    );
  }
}
