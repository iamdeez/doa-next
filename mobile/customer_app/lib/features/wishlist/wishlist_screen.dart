import 'package:cached_network_image/cached_network_image.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/providers.dart';
import '../../theme/app_theme.dart';
import '../product/product_detail_screen.dart';

final _won = NumberFormat('#,###', 'ko_KR');

/// GET /users/me/wishlist → productId 목록. P-001 경계로 상품 상세 미포함이라
/// 각 productId 를 GET /products/:id 로 보강한다(N+1, 관심목록 규모 작음).
final wishlistProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final dio = ref.read(dioProvider);
  final res = await dio.get<List<dynamic>>('/users/me/wishlist');
  final entries = (res.data ?? []).cast<Map<String, dynamic>>();
  final products = await Future.wait(entries.map((w) async {
    try {
      final p = await dio.get<Map<String, dynamic>>('/products/${w['productId']}',
          options: Options(extra: {'anonymous': true}));
      return p.data;
    } on DioException {
      return null; // 삭제된 상품 등 — 스킵
    }
  }));
  return [for (final p in products) if (p != null) p];
});

/// 관심상품 — 목업 "관심상품".
class WishlistScreen extends ConsumerWidget {
  const WishlistScreen({super.key});

  Future<void> _remove(WidgetRef ref, String productId) async {
    await ref.read(dioProvider).delete<dynamic>('/users/me/wishlist/$productId');
    ref.invalidate(wishlistProvider);
  }

  Future<void> _clearAll(BuildContext context, WidgetRef ref, List<Map<String, dynamic>> items) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('전체 삭제'),
        content: const Text('관심상품을 모두 삭제할까요?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('취소')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('삭제')),
        ],
      ),
    );
    if (ok != true) return;
    final dio = ref.read(dioProvider);
    await Future.wait(items.map((p) => dio.delete<dynamic>('/users/me/wishlist/${p['id']}')));
    ref.invalidate(wishlistProvider);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final wishlist = ref.watch(wishlistProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('관심상품')),
      body: wishlist.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('관심상품을 불러오지 못했습니다.\n$e',
            textAlign: TextAlign.center, style: const TextStyle(color: DoaColors.fgMuted))),
        data: (items) {
          if (items.isEmpty) {
            return const Center(
              child: Text('관심상품이 없습니다.', style: TextStyle(color: DoaColors.fgMuted)),
            );
          }
          return Column(
            children: [
              Container(
                color: DoaColors.surface,
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                child: Row(
                  children: [
                    Text('총 ${items.length}개', style: const TextStyle(fontWeight: FontWeight.w700)),
                    const Spacer(),
                    OutlinedButton(
                      onPressed: () => _clearAll(context, ref, items),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                        minimumSize: Size.zero,
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                      child: const Text('전체 삭제', style: TextStyle(fontSize: 13)),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: RefreshIndicator(
                  onRefresh: () => ref.refresh(wishlistProvider.future),
                  child: GridView.builder(
                    padding: const EdgeInsets.all(12),
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 2, childAspectRatio: 0.62, crossAxisSpacing: 12, mainAxisSpacing: 16),
                    itemCount: items.length,
                    itemBuilder: (_, i) => _WishCard(
                      product: items[i],
                      onRemove: () => _remove(ref, items[i]['id'] as String),
                    ),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _WishCard extends StatelessWidget {
  const _WishCard({required this.product, required this.onRemove});
  final Map<String, dynamic> product;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final images = (product['images'] as List?) ?? [];
    final imageUrl = images.isNotEmpty ? images.first['url'] as String? : null;
    final price = num.tryParse(product['price']?.toString() ?? '0') ?? 0;
    return InkWell(
      onTap: () => Navigator.push(context,
          MaterialPageRoute(builder: (_) => ProductDetailScreen(productId: product['id'] as String))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Stack(
            children: [
              AspectRatio(
                aspectRatio: 1,
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(DoaRadius.card),
                  child: imageUrl != null
                      ? CachedNetworkImage(imageUrl: imageUrl, fit: BoxFit.cover,
                          errorWidget: (_, __, ___) => Container(color: DoaColors.muted))
                      : Container(color: DoaColors.muted),
                ),
              ),
              Positioned(
                right: 8, bottom: 8,
                child: InkWell(
                  onTap: onRemove,
                  child: const CircleAvatar(
                    radius: 16,
                    backgroundColor: Colors.white,
                    child: Icon(Icons.favorite, color: DoaColors.danger, size: 18),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(product['title'] as String? ?? '', maxLines: 2, overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 13, height: 1.3)),
          const SizedBox(height: 4),
          Text('${_won.format(price)}원', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }
}
