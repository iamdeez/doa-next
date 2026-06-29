import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/providers.dart';
import '../../theme/app_theme.dart';

final _won = NumberFormat('#,###', 'ko_KR');
final _expiry = DateFormat('yyyy.MM.dd', 'ko_KR');

/// GET /users/me/coupons — 보유 쿠폰 전체(상태 무관).
final myCouponsProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final res = await ref.read(dioProvider).get<List<dynamic>>('/users/me/coupons');
  return (res.data ?? []).cast<Map<String, dynamic>>();
});

/// 쿠폰 라벨 — Coupon.name 부재로 할인값 기반(체크아웃과 동일 규칙).
String _couponLabel(Map<String, dynamic> coupon) {
  final type = coupon['type'] as String?;
  final value = num.tryParse(coupon['discountValue']?.toString() ?? '0') ?? 0;
  if (type == 'PERCENTAGE') {
    final cap = coupon['maxDiscountAmount'];
    final capStr = cap != null ? ' (최대 ${_won.format(num.tryParse(cap.toString()) ?? 0)}원)' : '';
    return '${value.toInt()}% 할인$capStr';
  }
  return '${_won.format(value)}원 할인';
}

const _statusLabel = {'unused': '사용 가능', 'used': '사용 완료', 'expired': '기간 만료'};

/// 쿠폰함 — 목업 내정보 쿠폰함. 상태 탭(전체/사용가능/사용완료/만료).
class CouponBoxScreen extends ConsumerStatefulWidget {
  const CouponBoxScreen({super.key});
  @override
  ConsumerState<CouponBoxScreen> createState() => _CouponBoxScreenState();
}

class _CouponBoxScreenState extends ConsumerState<CouponBoxScreen> {
  String _filter = 'all';
  static const _tabs = {'all': '전체', 'unused': '사용 가능', 'used': '사용 완료', 'expired': '만료'};

  @override
  Widget build(BuildContext context) {
    final coupons = ref.watch(myCouponsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('쿠폰함')),
      body: Column(
        children: [
          _tabBar(),
          Expanded(
            child: coupons.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(child: Text('쿠폰을 불러오지 못했습니다.\n$e',
                  textAlign: TextAlign.center, style: const TextStyle(color: DoaColors.fgMuted))),
              data: (all) {
                final items =
                    _filter == 'all' ? all : all.where((c) => c['status'] == _filter).toList();
                if (items.isEmpty) {
                  return const Center(
                    child: Text('보유한 쿠폰이 없습니다.', style: TextStyle(color: DoaColors.fgMuted)),
                  );
                }
                return RefreshIndicator(
                  onRefresh: () => ref.refresh(myCouponsProvider.future),
                  child: ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: items.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 12),
                    itemBuilder: (_, i) => _CouponCard(userCoupon: items[i]),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _tabBar() {
    return Container(
      color: DoaColors.surface,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Row(
        children: [
          for (final e in _tabs.entries)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: ChoiceChip(
                label: Text(e.value),
                selected: _filter == e.key,
                onSelected: (_) => setState(() => _filter = e.key),
                selectedColor: DoaColors.blueSoft,
                labelStyle: TextStyle(
                  fontSize: 13,
                  color: _filter == e.key ? DoaColors.blue : DoaColors.fgMuted,
                  fontWeight: _filter == e.key ? FontWeight.w700 : FontWeight.w500,
                ),
                side: BorderSide(color: _filter == e.key ? DoaColors.blue : DoaColors.border),
                backgroundColor: DoaColors.surface,
              ),
            ),
        ],
      ),
    );
  }
}

class _CouponCard extends StatelessWidget {
  const _CouponCard({required this.userCoupon});
  final Map<String, dynamic> userCoupon;

  @override
  Widget build(BuildContext context) {
    final status = userCoupon['status'] as String? ?? 'unused';
    final active = status == 'unused';
    final c = (userCoupon['coupon'] as Map?)?.cast<String, dynamic>() ?? {};
    final min = c['minOrderAmount'];
    final expires = DateTime.tryParse(c['expiresAt']?.toString() ?? '');
    final accent = active ? DoaColors.blue : DoaColors.fgSubtle;

    return Opacity(
      opacity: active ? 1 : 0.6,
      child: Container(
        decoration: BoxDecoration(
          color: DoaColors.surface,
          borderRadius: BorderRadius.circular(DoaRadius.card),
          border: Border.all(color: active ? DoaColors.blue : DoaColors.border),
        ),
        child: Row(
          children: [
            Container(
              width: 8,
              height: 96,
              decoration: BoxDecoration(
                color: accent,
                borderRadius: const BorderRadius.horizontal(left: Radius.circular(DoaRadius.card)),
              ),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(_couponLabel(c),
                              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: accent)),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: active ? DoaColors.blueSoft : DoaColors.muted,
                            borderRadius: BorderRadius.circular(DoaRadius.pill),
                          ),
                          child: Text(_statusLabel[status] ?? status,
                              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: accent)),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      min != null
                          ? '${_won.format(num.tryParse(min.toString()) ?? 0)}원 이상 구매 시'
                          : '최소 주문 금액 없음',
                      style: const TextStyle(fontSize: 13, color: DoaColors.fgMuted),
                    ),
                    const SizedBox(height: 2),
                    if (expires != null)
                      Text('~ ${_expiry.format(expires)} 까지',
                          style: const TextStyle(fontSize: 12, color: DoaColors.fgSubtle)),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
