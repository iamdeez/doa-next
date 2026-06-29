import 'package:cached_network_image/cached_network_image.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/providers.dart';
import '../../theme/app_theme.dart';
import '../cart/cart_screen.dart';
import '../product/product_detail_screen.dart';
import '../search/search_screen.dart';

final _won = NumberFormat('#,###', 'ko_KR');

/// GET /search/products — 공개 상품 목록.
final homeProductsProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final dio = ref.read(dioProvider);
  final res = await dio.get<Map<String, dynamic>>(
    '/search/products',
    queryParameters: {'size': 20, 'sort': 'latest'},
    options: Options(extra: {'anonymous': true}),
  );
  final items = (res.data?['items'] as List?) ?? [];
  return items.cast<Map<String, dynamic>>();
});

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final products = ref.watch(homeProductsProvider);
    return Scaffold(
      appBar: AppBar(
        title: Text('DOA',
            style: TextStyle(color: DoaColors.blue, fontWeight: FontWeight.w900, fontSize: 24)),
        actions: [
          IconButton(
            icon: const Icon(Icons.shopping_cart_outlined),
            onPressed: () => Navigator.push(
                context, MaterialPageRoute(builder: (_) => const CartScreen())),
          ),
          const SizedBox(width: 4),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(homeProductsProvider.future),
        child: ListView(
          children: [
            const _SearchBar(),
            const _HeroBanner(),
            const _CategoryGrid(),
            const _SectionTabs(),
            products.when(
              loading: () => const Padding(
                padding: EdgeInsets.all(40),
                child: Center(child: CircularProgressIndicator()),
              ),
              error: (e, _) => Padding(
                padding: const EdgeInsets.all(24),
                child: Text('상품을 불러오지 못했습니다.\n$e',
                    style: const TextStyle(color: DoaColors.fgMuted)),
              ),
              data: (items) => GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                padding: const EdgeInsets.all(12),
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 2,
                  childAspectRatio: 0.62,
                  crossAxisSpacing: 12,
                  mainAxisSpacing: 16,
                ),
                itemCount: items.length,
                itemBuilder: (_, i) => _ProductCard(product: items[i]),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SearchBar extends StatelessWidget {
  const _SearchBar();
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
      child: InkWell(
        onTap: () => Navigator.push(
            context, MaterialPageRoute(builder: (_) => const SearchScreen())),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
          decoration: BoxDecoration(
            color: DoaColors.muted,
            borderRadius: BorderRadius.circular(DoaRadius.control),
          ),
          child: Row(
            children: const [
              Expanded(
                  child: Text('검색어를 입력하세요.', style: TextStyle(color: DoaColors.fgSubtle))),
              Icon(Icons.search, color: DoaColors.fgMuted),
            ],
          ),
        ),
      ),
    );
  }
}

class _HeroBanner extends StatelessWidget {
  const _HeroBanner();
  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      height: 150,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFFD9E6FB), Color(0xFFEAF1FE)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(DoaRadius.card),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: const [
          Text('브랜드 오픈 기념 50% 할인',
              style: TextStyle(color: DoaColors.fgMuted, fontSize: 13)),
          SizedBox(height: 6),
          Text('피부 속까지 투명한 앰플',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }
}

class _CategoryGrid extends StatelessWidget {
  const _CategoryGrid();
  static const _items = [
    ('🎟️', '쿠폰/혜택'), ('📅', '출석체크'), ('🔥', '특가'), ('🥗', '식품'), ('🛒', '마트'),
    ('🚚', '당일배송'), ('📺', '홈쇼핑'), ('🛋️', '홈/리빙'), ('👗', '패션'), ('💄', '뷰티'),
  ];
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 20, 8, 8),
      child: GridView.count(
        crossAxisCount: 5,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        mainAxisSpacing: 16,
        childAspectRatio: 0.78,
        children: [
          for (final (emoji, label) in _items)
            Column(
              children: [
                Container(
                  width: 48, height: 48,
                  decoration: const BoxDecoration(color: DoaColors.blueSoft, shape: BoxShape.circle),
                  child: Center(child: Text(emoji, style: const TextStyle(fontSize: 22))),
                ),
                const SizedBox(height: 6),
                Text(label, style: const TextStyle(fontSize: 11)),
              ],
            ),
        ],
      ),
    );
  }
}

class _SectionTabs extends StatelessWidget {
  const _SectionTabs();
  static const _tabs = ['추천', '브랜드 패션', '트렌드 패션', '뷰티 잡화', '유아동'];
  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 44,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: _tabs.length,
        separatorBuilder: (_, __) => const SizedBox(width: 18),
        itemBuilder: (_, i) => Center(
          child: Text(
            _tabs[i],
            style: TextStyle(
              fontSize: 15,
              fontWeight: i == 0 ? FontWeight.w800 : FontWeight.w500,
              color: i == 0 ? DoaColors.blue : DoaColors.fgMuted,
            ),
          ),
        ),
      ),
    );
  }
}

class _ProductCard extends StatelessWidget {
  const _ProductCard({required this.product});
  final Map<String, dynamic> product;

  @override
  Widget build(BuildContext context) {
    final title = product['title'] as String? ?? '';
    final price = product['price']?.toString() ?? '0';
    final images = (product['images'] as List?) ?? [];
    final imageUrl = images.isNotEmpty ? images.first['url'] as String? : null;

    return InkWell(
      onTap: () => Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => ProductDetailScreen(productId: product['id'] as String)),
      ),
      child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        AspectRatio(
          aspectRatio: 1,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(DoaRadius.card),
            child: imageUrl != null
                ? CachedNetworkImage(
                    imageUrl: imageUrl,
                    fit: BoxFit.cover,
                    placeholder: (_, __) => Container(color: DoaColors.muted),
                    errorWidget: (_, __, ___) => Container(color: DoaColors.muted),
                  )
                : Container(color: DoaColors.muted, child: const Icon(Icons.image_outlined, color: DoaColors.fgSubtle)),
          ),
        ),
        const SizedBox(height: 8),
        Text(title, maxLines: 2, overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 13, height: 1.3)),
        const SizedBox(height: 4),
        Text('${_won.format(num.tryParse(price) ?? 0)}원',
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
      ],
      ),
    );
  }
}
