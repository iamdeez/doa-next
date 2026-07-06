import 'package:cached_network_image/cached_network_image.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/providers.dart';
import '../../theme/app_theme.dart';
import '../product/product_detail_screen.dart';

final _won = NumberFormat('#,###', 'ko_KR');

/// GET /categories — 카테고리 목록(플랫, 인증 불필요).
final categoriesProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final res = await ref.read(dioProvider).get<List<dynamic>>(
        '/categories',
        options: Options(extra: {'anonymous': true}),
      );
  return (res.data ?? []).cast<Map<String, dynamic>>();
});

/// GET /search/products?categoryId= — 선택 카테고리 상품.
final categoryProductsProvider =
    FutureProvider.autoDispose.family<List<Map<String, dynamic>>, String>((ref, categoryId) async {
  final res = await ref.read(dioProvider).get<Map<String, dynamic>>(
        '/search/products',
        queryParameters: {'categoryId': categoryId, 'size': 20},
        options: Options(extra: {'anonymous': true}),
      );
  return ((res.data?['items'] as List?) ?? []).cast<Map<String, dynamic>>();
});

/// 카테고리 — 목업 좌측 레일 + 우측 상품(플랫 카테고리 적응).
class CategoryScreen extends ConsumerStatefulWidget {
  const CategoryScreen({super.key});
  @override
  ConsumerState<CategoryScreen> createState() => _CategoryScreenState();
}

class _CategoryScreenState extends ConsumerState<CategoryScreen> {
  String? _selectedId;

  @override
  Widget build(BuildContext context) {
    final categories = ref.watch(categoriesProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('카테고리'), automaticallyImplyLeading: false),
      body: categories.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('카테고리를 불러오지 못했습니다.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: DoaColors.fgMuted)),
              const SizedBox(height: 12),
              ElevatedButton(
                onPressed: () => ref.invalidate(categoriesProvider),
                child: const Text('재시도'),
              ),
            ],
          ),
        ),
        data: (cats) {
          if (cats.isEmpty) {
            return const Center(child: Text('카테고리가 없습니다.', style: TextStyle(color: DoaColors.fgMuted)));
          }
          _selectedId ??= cats.first['id'] as String?;
          return Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SizedBox(
                width: 112,
                child: Container(
                  color: DoaColors.canvas,
                  child: ListView(
                    padding: EdgeInsets.zero,
                    children: [
                      for (final c in cats) _railItem(c),
                    ],
                  ),
                ),
              ),
              Expanded(child: _CategoryProducts(categoryId: _selectedId!)),
            ],
          );
        },
      ),
    );
  }

  Widget _railItem(Map<String, dynamic> c) {
    final id = c['id'] as String;
    final selected = id == _selectedId;
    return InkWell(
      onTap: () => setState(() => _selectedId = id),
      child: Container(
        color: selected ? DoaColors.blue : DoaColors.canvas,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 18),
        child: Text(
          c['name'] as String? ?? '',
          style: TextStyle(
            fontSize: 14,
            fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
            color: selected ? Colors.white : DoaColors.fgMuted,
          ),
        ),
      ),
    );
  }
}

class _CategoryProducts extends ConsumerWidget {
  const _CategoryProducts({required this.categoryId});
  final String categoryId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final products = ref.watch(categoryProductsProvider(categoryId));
    return products.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => const Center(
          child: Text('상품을 불러오지 못했습니다.', style: TextStyle(color: DoaColors.fgMuted))),
      data: (items) => items.isEmpty
          ? const Center(child: Text('상품이 없습니다.', style: TextStyle(color: DoaColors.fgMuted)))
          : GridView.builder(
              padding: const EdgeInsets.all(12),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2, childAspectRatio: 0.6, crossAxisSpacing: 12, mainAxisSpacing: 16),
              itemCount: items.length,
              itemBuilder: (_, i) => _MiniCard(product: items[i]),
            ),
    );
  }
}

class _MiniCard extends StatelessWidget {
  const _MiniCard({required this.product});
  final Map<String, dynamic> product;
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
          const SizedBox(height: 8),
          Text(product['title'] as String? ?? '', maxLines: 2, overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 13, height: 1.3)),
          const SizedBox(height: 4),
          Text('${_won.format(price)}원', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }
}
