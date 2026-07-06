import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../theme/app_theme.dart';

const _kPushOrder = 'notif_push_order';
const _kPushPromo = 'notif_push_promo';
const _kPushEvent = 'notif_push_event';

final _notifProvider =
    NotifierProvider<_NotifNotifier, Map<String, bool>>(_NotifNotifier.new);

class _NotifNotifier extends Notifier<Map<String, bool>> {
  @override
  Map<String, bool> build() {
    _load();
    return {_kPushOrder: true, _kPushPromo: true, _kPushEvent: true};
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    state = {
      _kPushOrder: prefs.getBool(_kPushOrder) ?? true,
      _kPushPromo: prefs.getBool(_kPushPromo) ?? true,
      _kPushEvent: prefs.getBool(_kPushEvent) ?? true,
    };
  }

  Future<void> toggle(String key) async {
    final next = !(state[key] ?? true);
    state = {...state, key: next};
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(key, next);
  }
}

/// 알림 설정 화면 — 주문/프로모션/이벤트 알림 on/off (shared_preferences 저장)
class NotificationSettingsScreen extends ConsumerWidget {
  const NotificationSettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final settings = ref.watch(_notifProvider);
    final notifier = ref.read(_notifProvider.notifier);

    Widget row(String key, String label, String description) => SwitchListTile(
          value: settings[key] ?? true,
          onChanged: (_) => notifier.toggle(key),
          title: Text(label,
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
          subtitle: Text(description,
              style: const TextStyle(fontSize: 13, color: DoaColors.fgMuted)),
          activeThumbColor: DoaColors.blue,
        );

    return Scaffold(
      appBar: AppBar(title: const Text('알림 설정')),
      body: Container(
        color: DoaColors.surface,
        child: Column(
          children: [
            row(_kPushOrder, '주문 알림', '주문·배송·취소 상태 변경 시 알림을 받습니다.'),
            const Divider(),
            row(_kPushPromo, '프로모션 알림', '할인·쿠폰 등 프로모션 정보를 받습니다.'),
            const Divider(),
            row(_kPushEvent, '이벤트 알림', '기획전·이벤트 소식을 받습니다.'),
          ],
        ),
      ),
    );
  }
}
