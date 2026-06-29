import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/providers.dart';
import '../../theme/app_theme.dart';

final _ts = DateFormat('yyyy-MM-dd HH:mm:ss', 'ko_KR');
final _arrival = DateFormat('M월 d일(E) 도착예정', 'ko_KR');

/// GET /shipments/:id/tracking — 배송 추적 이력 (append-only, occurredAt desc).
final trackingProvider =
    FutureProvider.autoDispose.family<List<Map<String, dynamic>>, String>((ref, shipmentId) async {
  final res = await ref.read(dioProvider).get<List<dynamic>>('/shipments/$shipmentId/tracking');
  return (res.data ?? []).cast<Map<String, dynamic>>();
});

const _steps = ['주문접수', '상품준비', '배송중', '배송완료'];

/// ShipmentStatus → 진행 단계 index (0=주문접수 … 3=배송완료).
int _stepOf(String status) => switch (status) {
      'preparing' => 1,
      'shipped' => 2,
      'in_transit' => 2,
      'delivered' => 3,
      _ => 0,
    };

String _headerLabel(String status) => switch (status) {
      'preparing' => '상품 준비중',
      'shipped' => '배송 출발',
      'in_transit' => '배송중',
      'delivered' => '배송완료',
      _ => '주문 접수',
    };

/// 배송 조회 — 목업 "배송 조회" 화면. shipment(map) 전달 + tracking 조회.
class DeliveryTrackingScreen extends ConsumerWidget {
  const DeliveryTrackingScreen({super.key, required this.shipment});
  final Map<String, dynamic> shipment;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final shipmentId = shipment['id'] as String;
    final status = shipment['status'] as String? ?? 'preparing';
    final carrier = shipment['carrier'] as String? ?? '택배';
    final trackingNo = shipment['trackingNumber'] as String? ?? '-';
    final deliveredAt = DateTime.tryParse(shipment['deliveredAt']?.toString() ?? '');
    final currentStep = _stepOf(status);
    final events = ref.watch(trackingProvider(shipmentId));

    return Scaffold(
      appBar: AppBar(title: const Text('배송 조회')),
      body: ListView(
        children: [
          _header(status, deliveredAt),
          _infoRow('운송장번호', trackingNo),
          _infoRow('택배사', carrier),
          const Divider(height: 24, indent: 20, endIndent: 20),
          _stepper(currentStep),
          const Divider(height: 8, thickness: 8, color: DoaColors.canvas),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 8),
            child: Text('배송 이력', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
          ),
          events.when(
            loading: () => const Padding(
                padding: EdgeInsets.all(32), child: Center(child: CircularProgressIndicator())),
            error: (e, _) => const Padding(
                padding: EdgeInsets.all(20),
                child: Text('배송 이력을 불러오지 못했습니다.', style: TextStyle(color: DoaColors.fgMuted))),
            data: (list) => list.isEmpty
                ? const Padding(
                    padding: EdgeInsets.all(20),
                    child: Text('등록된 배송 이력이 없습니다.', style: TextStyle(color: DoaColors.fgMuted)))
                : Padding(
                    padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
                    child: Column(
                      children: [
                        for (var i = 0; i < list.length; i++)
                          _TimelineRow(event: list[i], isFirst: i == 0, isLast: i == list.length - 1),
                      ],
                    ),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _header(String status, DateTime? deliveredAt) {
    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: DoaColors.blue,
        borderRadius: BorderRadius.circular(DoaRadius.card),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.local_shipping, color: Colors.white, size: 18),
              const SizedBox(width: 8),
              Text(
                deliveredAt != null ? _arrival.format(deliveredAt) : '배송 준비 중',
                style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(_headerLabel(status),
              style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }

  Widget _infoRow(String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 6),
        child: Row(
          children: [
            SizedBox(width: 80, child: Text(label, style: const TextStyle(color: DoaColors.fgMuted, fontSize: 13))),
            Expanded(
              child: Text(value,
                  textAlign: TextAlign.right,
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
            ),
          ],
        ),
      );

  Widget _stepper(int currentStep) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      child: Row(
        children: [
          for (var i = 0; i < _steps.length; i++) ...[
            Expanded(
              child: Column(
                children: [
                  Container(
                    width: 40, height: 40,
                    decoration: BoxDecoration(
                      color: i <= currentStep ? DoaColors.blueSoft : DoaColors.muted,
                      shape: BoxShape.circle,
                    ),
                    child: Icon(Icons.check,
                        size: 20, color: i <= currentStep ? DoaColors.blue : DoaColors.fgSubtle),
                  ),
                  const SizedBox(height: 6),
                  Text(_steps[i],
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: i <= currentStep ? FontWeight.w700 : FontWeight.w400,
                        color: i <= currentStep ? DoaColors.blue : DoaColors.fgSubtle,
                      )),
                ],
              ),
            ),
            if (i < _steps.length - 1)
              Container(
                width: 20, height: 2,
                margin: const EdgeInsets.only(bottom: 24),
                color: i < currentStep ? DoaColors.blue : DoaColors.border,
              ),
          ],
        ],
      ),
    );
  }
}

/// 배송이력 타임라인 한 행 — 좌측 점·선, 우측 시각·설명.
class _TimelineRow extends StatelessWidget {
  const _TimelineRow({required this.event, required this.isFirst, required this.isLast});
  final Map<String, dynamic> event;
  final bool isFirst;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    final occurred = DateTime.tryParse(event['occurredAt']?.toString() ?? '');
    final desc = event['description']?.toString() ?? '';
    // occurredAt desc 정렬 → 첫 행이 최신. 최신 이력만 강조.
    final active = isFirst;
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Column(
            children: [
              Container(
                width: 14, height: 14,
                margin: const EdgeInsets.only(top: 2),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: active ? DoaColors.blue : DoaColors.surface,
                  border: Border.all(color: active ? DoaColors.blue : DoaColors.border, width: 2),
                ),
              ),
              if (!isLast)
                Expanded(child: Container(width: 2, color: DoaColors.border)),
            ],
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(bottom: 18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (occurred != null)
                    Text(_ts.format(occurred),
                        style: const TextStyle(fontSize: 12, color: DoaColors.fgSubtle)),
                  const SizedBox(height: 2),
                  Text(desc,
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                        color: active ? DoaColors.blue : DoaColors.fg,
                      )),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
