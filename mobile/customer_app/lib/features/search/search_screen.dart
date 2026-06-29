import 'package:cached_network_image/cached_network_image.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/providers.dart';
import '../../theme/app_theme.dart';
import '../product/product_detail_screen.dart';

final _won = NumberFormat('#,###', 'ko_KR');

final searchProvider =
    FutureProvider.autoDispose.family<List<Map<String, dynamic>>, String>((ref, q) async {
  if (q.trim().isEmpty) return [];
  final res = await ref.read(dioProvider).get<Map<String, dynamic>>(
    '/search/products',
    queryParameters: {'q': q, 'size': 20},
    options: Options(extra: {'anonymous': true}),
  );
  return ((res.data?['items'] as List?) ?? []).cast<Map<String, dynamic>>();
});

class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key});
  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  final _ctrl = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final results = ref.watch(searchProvider(_query));
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: TextField(
          controller: _ctrl,
          autofocus: true,
          textInputAction: TextInputAction.search,
          decoration: const InputDecoration(
            hintText: '검색어를 입력하세요.',
            border: InputBorder.none,
            enabledBorder: InputBorder.none,
            focusedBorder: InputBorder.none,
            filled: false,
          ),
          onSubmitted: (v) => setState(() => _query = v),
        ),
        actions: [
          IconButton(icon: const Icon(Icons.search), onPressed: () => setState(() => _query = _ctrl.text)),
        ],
      ),
      body: _query.isEmpty
          ? const Center(child: Text('상품을 검색해 보세요.', style: TextStyle(color: DoaColors.fgMuted)))
          : results.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(child: Text('검색 실패\n$e')),
              data: (items) => items.isEmpty
                  ? const Center(child: Text('검색 결과가 없습니다.', style: TextStyle(color: DoaColors.fgMuted)))
                  : GridView.builder(
                      padding: const EdgeInsets.all(12),
                      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 2, childAspectRatio: 0.62, crossAxisSpacing: 12, mainAxisSpacing: 16),
                      itemCount: items.length,
                      itemBuilder: (_, i) => _ResultCard(product: items[i]),
                    ),
            ),
    );
  }
}

class _ResultCard extends StatelessWidget {
  const _ResultCard({required this.product});
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
          Text('${_won.format(price)}원', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }
}
