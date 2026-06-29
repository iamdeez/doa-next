import 'package:cached_network_image/cached_network_image.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/providers.dart';
import '../../theme/app_theme.dart';
import 'variant_sheet.dart';

final _won = NumberFormat('#,###', 'ko_KR');

final productDetailProvider =
    FutureProvider.autoDispose.family<Map<String, dynamic>, String>((ref, id) async {
  final dio = ref.read(dioProvider);
  final res = await dio.get<Map<String, dynamic>>('/products/$id',
      options: Options(extra: {'anonymous': true}));
  return res.data!;
});

class ProductDetailScreen extends ConsumerWidget {
  const ProductDetailScreen({super.key, required this.productId});
  final String productId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detail = ref.watch(productDetailProvider(productId));
    return Scaffold(
      appBar: AppBar(
        title: detail.maybeWhen(
          data: (p) => Text(p['title'] as String? ?? '', maxLines: 1, overflow: TextOverflow.ellipsis),
          orElse: () => const Text(''),
        ),
        actions: const [Icon(Icons.search), SizedBox(width: 16), Icon(Icons.shopping_cart_outlined), SizedBox(width: 12)],
      ),
      body: detail.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('상품을 불러오지 못했습니다.\n$e')),
        data: (p) => _Body(product: p),
      ),
      bottomNavigationBar: detail.maybeWhen(
        data: (p) => _ActionBar(product: p),
        orElse: () => null,
      ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({required this.product});
  final Map<String, dynamic> product;
  @override
  Widget build(BuildContext context) {
    final images = (product['images'] as List?) ?? [];
    final imageUrl = images.isNotEmpty ? images.first['url'] as String? : null;
    final price = num.tryParse(product['price']?.toString() ?? '0') ?? 0;

    return ListView(
      children: [
        AspectRatio(
          aspectRatio: 1,
          child: imageUrl != null
              ? CachedNetworkImage(imageUrl: imageUrl, fit: BoxFit.cover,
                  errorWidget: (_, __, ___) => Container(color: DoaColors.muted))
              : Container(color: DoaColors.muted, child: const Icon(Icons.image_outlined, size: 48, color: DoaColors.fgSubtle)),
        ),
        Container(
          color: DoaColors.surface,
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(child: Text(product['title'] as String? ?? '',
                      style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700, height: 1.35))),
                  const Icon(Icons.favorite_border, color: DoaColors.fgMuted),
                ],
              ),
              const SizedBox(height: 8),
              const Row(children: [
                Icon(Icons.star, color: DoaColors.star, size: 16),
                SizedBox(width: 4),
                Text('4.8', style: TextStyle(fontWeight: FontWeight.w600)),
                SizedBox(width: 6),
                Text('리뷰', style: TextStyle(color: DoaColors.fgMuted, fontSize: 13)),
              ]),
              const SizedBox(height: 12),
              Text('${_won.format(price)}원',
                  style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
            ],
          ),
        ),
        const SizedBox(height: 8),
        Container(
          color: DoaColors.surface,
          padding: const EdgeInsets.all(16),
          child: Row(
            children: const [
              Text('배송비', style: TextStyle(color: DoaColors.fgMuted)),
              Spacer(),
              Text('무료배송', style: TextStyle(fontWeight: FontWeight.w600)),
            ],
          ),
        ),
        const SizedBox(height: 8),
        Container(
          color: DoaColors.surface,
          padding: const EdgeInsets.all(16),
          child: Text(product['description'] as String? ?? '상세 설명이 없습니다.',
              style: const TextStyle(color: DoaColors.fgMuted, height: 1.6)),
        ),
        const SizedBox(height: 100),
      ],
    );
  }
}

class _ActionBar extends StatelessWidget {
  const _ActionBar({required this.product});
  final Map<String, dynamic> product;
  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Container(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
        decoration: const BoxDecoration(
          color: DoaColors.surface,
          border: Border(top: BorderSide(color: DoaColors.border)),
        ),
        child: Row(
          children: [
            Expanded(
              child: OutlinedButton(
                onPressed: () => showVariantSheet(context, product, buyNow: false),
                child: const Text('장바구니'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              flex: 2,
              child: ElevatedButton(
                onPressed: () => showVariantSheet(context, product, buyNow: true),
                child: const Text('구매하기'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
