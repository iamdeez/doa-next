import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../theme/app_theme.dart';
import '../address/address_book_screen.dart';
import '../coupon/coupon_box_screen.dart';
import 'mileage_screen.dart';
import '../notification/notification_settings_screen.dart';
import '../order/order_history_screen.dart';
import '../support/faq_screen.dart';
import '../support/notice_screen.dart';
import '../support/support_actions.dart';
import '../wishlist/wishlist_screen.dart';
import 'profile_edit_screen.dart';

class MyPageScreen extends ConsumerWidget {
  const MyPageScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('내정보'),
        leading: const SizedBox(),
        actions: const [
          Icon(Icons.search), SizedBox(width: 16),
          Icon(Icons.settings_outlined), SizedBox(width: 12),
        ],
      ),
      body: ListView(
        children: [
          const _ProfileRow(),
          const _QuickCard(),
          _Section(title: '쇼핑 정보', items: [
            ('최근 본 상품', null),
            ('배송 주소록', () => Navigator.push(
                context, MaterialPageRoute(builder: (_) => const AddressBookScreen()))),
            ('마일리지 포인트', () => Navigator.push(
                context, MaterialPageRoute(builder: (_) => const MileageScreen()))),
          ]),
          const Divider(height: 8, thickness: 8, color: DoaColors.canvas),
          _Section(title: '고객 서비스', items: [
            ('1:1 문의하기', () => openSupportEmail(context)),
            ('자주하는 질문(FAQ)', () => Navigator.push(
                context, MaterialPageRoute(builder: (_) => const FaqScreen()))),
            ('공지사항', () => Navigator.push(
                context, MaterialPageRoute(builder: (_) => const NoticeScreen()))),
            ('알림설정', () => Navigator.push(
                context, MaterialPageRoute(builder: (_) => const NotificationSettingsScreen()))),
            ('개인정보수정', () => Navigator.push(
                context, MaterialPageRoute(builder: (_) => const ProfileEditScreen()))),
          ]),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Expanded(child: OutlinedButton(onPressed: () {}, child: const Text('고객센터'))),
                const SizedBox(width: 12),
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => ref.read(authControllerProvider.notifier).logout(),
                    child: const Text('로그아웃'),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ProfileRow extends ConsumerWidget {
  const _ProfileRow();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final meAsync = ref.watch(authMeProvider);
    final name = meAsync.maybeWhen(
      data: (data) => data['name'] as String? ?? '회원',
      orElse: () => '회원',
    );
    final email = meAsync.maybeWhen(
      data: (data) => data['email'] as String? ?? '',
      orElse: () => '',
    );

    return InkWell(
      onTap: () => Navigator.push(
          context, MaterialPageRoute(builder: (_) => const ProfileEditScreen())),
      child: Container(
        color: DoaColors.surface,
        padding: const EdgeInsets.all(20),
        child: Row(
          children: [
            const CircleAvatar(radius: 26, backgroundColor: DoaColors.muted,
                child: Icon(Icons.person, color: DoaColors.fgSubtle)),
            const SizedBox(width: 14),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text(email, style: const TextStyle(color: DoaColors.fgMuted, fontSize: 13)),
              ],
            ),
            const Spacer(),
            const Icon(Icons.chevron_right, color: DoaColors.fgSubtle),
          ],
        ),
      ),
    );
  }
}

class _QuickCard extends StatelessWidget {
  const _QuickCard();
  @override
  Widget build(BuildContext context) {
    Widget item(IconData icon, String label, {VoidCallback? onTap}) => Expanded(
          child: InkWell(
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Column(
                children: [
                  Icon(icon, color: DoaColors.blue, size: 28),
                  const SizedBox(height: 8),
                  Text(label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                ],
              ),
            ),
          ),
        );
    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.symmetric(vertical: 18),
      decoration: BoxDecoration(
        color: DoaColors.surface,
        borderRadius: BorderRadius.circular(DoaRadius.card),
        border: Border.all(color: DoaColors.border),
      ),
      child: Row(
        children: [
          item(Icons.local_shipping, '주문/배송',
              onTap: () => Navigator.push(
                  context, MaterialPageRoute(builder: (_) => const OrderHistoryScreen()))),
          item(Icons.favorite, '찜',
              onTap: () => Navigator.push(
                  context, MaterialPageRoute(builder: (_) => const WishlistScreen()))),
          item(Icons.confirmation_num, '쿠폰함',
              onTap: () => Navigator.push(
                  context, MaterialPageRoute(builder: (_) => const CouponBoxScreen()))),
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.items});
  final String title;
  final List<(String, VoidCallback?)> items;
  @override
  Widget build(BuildContext context) {
    return Container(
      color: DoaColors.surface,
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: Text(title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
          ),
          for (final (label, onTap) in items)
            ListTile(
              title: Text(label, style: const TextStyle(fontSize: 14)),
              trailing: const Icon(Icons.chevron_right, color: DoaColors.fgSubtle, size: 20),
              onTap: onTap,
              dense: true,
            ),
        ],
      ),
    );
  }
}
