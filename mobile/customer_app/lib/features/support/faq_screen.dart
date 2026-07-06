import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../theme/app_theme.dart';

/// 자주하는 질문(FAQ) 화면 — 사전 정의 정적 목록 표시 (FR-006)
class FaqScreen extends ConsumerWidget {
  const FaqScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final faqAsync = ref.watch(faqProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('자주하는 질문')),
      body: faqAsync.when(
        data: (items) {
          if (items.isEmpty) {
            return const Center(
              child: Text(
                '등록된 FAQ가 없습니다.',
                style: TextStyle(color: DoaColors.fgMuted, fontSize: 14),
              ),
            );
          }
          return ListView.separated(
            itemCount: items.length,
            separatorBuilder: (_, __) => const Divider(height: 1),
            itemBuilder: (context, index) {
              final item = items[index];
              return ExpansionTile(
                title: Text(
                  item['question'] as String,
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500),
                ),
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        item['answer'] as String,
                        style: const TextStyle(color: DoaColors.fgMuted, fontSize: 14),
                      ),
                    ),
                  ),
                ],
              );
            },
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => const Center(
          child: Text('오류가 발생했습니다.', style: TextStyle(color: DoaColors.fgMuted)),
        ),
      ),
    );
  }
}
