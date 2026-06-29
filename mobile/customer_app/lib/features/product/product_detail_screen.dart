import 'package:cached_network_image/cached_network_image.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/providers.dart';
import '../../theme/app_theme.dart';
import 'variant_sheet.dart';

final _won = NumberFormat('#,###', 'ko_KR');

final _reviewDate = DateFormat('yyyy.MM.dd', 'ko_KR');

final productDetailProvider =
    FutureProvider.autoDispose.family<Map<String, dynamic>, String>((ref, id) async {
  final dio = ref.read(dioProvider);
  final res = await dio.get<Map<String, dynamic>>('/products/$id',
      options: Options(extra: {'anonymous': true}));
  return res.data!;
});

/// GET /products/:id/reviews — 상품 리뷰 목록 (인증 불필요).
final productReviewsProvider =
    FutureProvider.autoDispose.family<List<Map<String, dynamic>>, String>((ref, id) async {
  final res = await ref.read(dioProvider).get<Map<String, dynamic>>(
        '/products/$id/reviews',
        queryParameters: {'take': 20},
        options: Options(extra: {'anonymous': true}),
      );
  return ((res.data?['items'] as List?) ?? []).cast<Map<String, dynamic>>();
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
        const SizedBox(height: 8),
        _ReviewSection(productId: product['id'] as String),
        const SizedBox(height: 100),
      ],
    );
  }
}

/// 상품 리뷰 목록 섹션 — 별점·내용·작성일.
class _ReviewSection extends ConsumerWidget {
  const _ReviewSection({required this.productId});
  final String productId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reviews = ref.watch(productReviewsProvider(productId));
    return Container(
      color: DoaColors.surface,
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          reviews.maybeWhen(
            data: (list) => Text('구매후기 ${list.length}',
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
            orElse: () => const Text('구매후기',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
          ),
          const SizedBox(height: 12),
          reviews.when(
            loading: () => const Padding(
                padding: EdgeInsets.symmetric(vertical: 16),
                child: Center(child: CircularProgressIndicator())),
            error: (e, _) => const Text('리뷰를 불러오지 못했습니다.',
                style: TextStyle(color: DoaColors.fgMuted)),
            data: (list) => list.isEmpty
                ? const Padding(
                    padding: EdgeInsets.symmetric(vertical: 16),
                    child: Text('아직 등록된 구매후기가 없습니다.',
                        style: TextStyle(color: DoaColors.fgMuted)),
                  )
                : Column(children: [for (final r in list) _reviewRow(r)]),
          ),
        ],
      ),
    );
  }

  Widget _reviewRow(Map<String, dynamic> r) {
    final rating = (num.tryParse(r['rating']?.toString() ?? '0') ?? 0).toInt();
    final created = DateTime.tryParse(r['createdAt']?.toString() ?? '');
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              for (var i = 1; i <= 5; i++)
                Icon(i <= rating ? Icons.star : Icons.star_border,
                    color: i <= rating ? DoaColors.star : DoaColors.fgSubtle, size: 15),
              const Spacer(),
              if (created != null)
                Text(_reviewDate.format(created),
                    style: const TextStyle(color: DoaColors.fgSubtle, fontSize: 12)),
            ],
          ),
          const SizedBox(height: 6),
          Text(r['content']?.toString() ?? '',
              style: const TextStyle(fontSize: 14, height: 1.5)),
          const Divider(height: 24),
        ],
      ),
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
