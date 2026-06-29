import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../theme/app_theme.dart';
import 'address_edit_screen.dart';

/// GET /users/me/addresses — 배송 주소록.
final addressBookProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final res = await ref.read(dioProvider).get<List<dynamic>>('/users/me/addresses');
  return (res.data ?? []).cast<Map<String, dynamic>>();
});

/// 배송 주소록 — 목록·기본설정·수정·삭제·추가.
class AddressBookScreen extends ConsumerWidget {
  const AddressBookScreen({super.key});

  Future<void> _setDefault(WidgetRef ref, String id) async {
    await ref.read(dioProvider).patch<dynamic>('/users/me/addresses/$id/default');
    ref.invalidate(addressBookProvider);
  }

  Future<void> _delete(BuildContext context, WidgetRef ref, String id) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('배송지 삭제'),
        content: const Text('이 배송지를 삭제할까요?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('취소')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('삭제')),
        ],
      ),
    );
    if (ok != true) return;
    await ref.read(dioProvider).delete<dynamic>('/users/me/addresses/$id');
    ref.invalidate(addressBookProvider);
  }

  Future<void> _openForm(BuildContext context, WidgetRef ref, {Map<String, dynamic>? address}) async {
    final saved = await Navigator.push<bool>(
      context,
      MaterialPageRoute(builder: (_) => AddressEditScreen(address: address)),
    );
    if (saved == true) ref.invalidate(addressBookProvider);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final addresses = ref.watch(addressBookProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('배송 주소록')),
      body: addresses.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('주소록을 불러오지 못했습니다.\n$e',
            textAlign: TextAlign.center, style: const TextStyle(color: DoaColors.fgMuted))),
        data: (items) => items.isEmpty
            ? const Center(child: Text('등록된 배송지가 없습니다.', style: TextStyle(color: DoaColors.fgMuted)))
            : ListView.separated(
                padding: const EdgeInsets.all(16),
                itemCount: items.length,
                separatorBuilder: (_, __) => const SizedBox(height: 12),
                itemBuilder: (_, i) => _AddressCard(
                  address: items[i],
                  onSetDefault: () => _setDefault(ref, items[i]['id'] as String),
                  onEdit: () => _openForm(context, ref, address: items[i]),
                  onDelete: () => _delete(context, ref, items[i]['id'] as String),
                ),
              ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _openForm(context, ref),
        backgroundColor: DoaColors.blue,
        icon: const Icon(Icons.add),
        label: const Text('배송지 추가'),
      ),
    );
  }
}

class _AddressCard extends StatelessWidget {
  const _AddressCard({
    required this.address,
    required this.onSetDefault,
    required this.onEdit,
    required this.onDelete,
  });
  final Map<String, dynamic> address;
  final VoidCallback onSetDefault;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final isDefault = address['isDefault'] == true;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: DoaColors.surface,
        borderRadius: BorderRadius.circular(DoaRadius.card),
        border: Border.all(color: isDefault ? DoaColors.blue : DoaColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(address['recipientName']?.toString() ?? '',
                  style: const TextStyle(fontWeight: FontWeight.w700)),
              if (isDefault) ...[
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(color: DoaColors.blueSoft, borderRadius: BorderRadius.circular(4)),
                  child: const Text('기본 배송지',
                      style: TextStyle(fontSize: 11, color: DoaColors.blue, fontWeight: FontWeight.w600)),
                ),
              ],
            ],
          ),
          const SizedBox(height: 6),
          Text(address['phone']?.toString() ?? '', style: const TextStyle(color: DoaColors.fgMuted, fontSize: 13)),
          const SizedBox(height: 2),
          Text(
            '[${address['zipCode'] ?? ''}] ${address['address1'] ?? ''} ${address['address2'] ?? ''}',
            style: const TextStyle(fontSize: 13, height: 1.4),
          ),
          const Divider(height: 20),
          Row(
            children: [
              if (!isDefault)
                _action('기본 설정', onSetDefault),
              const Spacer(),
              _action('수정', onEdit),
              const SizedBox(width: 4),
              _action('삭제', onDelete, color: DoaColors.danger),
            ],
          ),
        ],
      ),
    );
  }

  Widget _action(String label, VoidCallback onTap, {Color? color}) => TextButton(
        onPressed: onTap,
        style: TextButton.styleFrom(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          minimumSize: Size.zero,
          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        ),
        child: Text(label, style: TextStyle(fontSize: 13, color: color ?? DoaColors.fgMuted)),
      );
}
