import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../theme/app_theme.dart';

/// 공지사항 화면 — 사전 정의 정적 목록 표시 (FR-007)
class NoticeScreen extends ConsumerWidget {
  const NoticeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final noticeAsync = ref.watch(noticeProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('공지사항')),
      body: noticeAsync.when(
        data: (items) {
          if (items.isEmpty) {
            return const Center(
              child: Text(
                '등록된 공지사항이 없습니다.',
                style: TextStyle(color: DoaColors.fgMuted, fontSize: 14),
              ),
            );
          }
          return ListView.separated(
            itemCount: items.length,
            separatorBuilder: (_, __) => const Divider(height: 1),
            itemBuilder: (context, index) {
              final item = items[index];
              final createdAt = item['createdAt'] as String;
              final dateStr = createdAt.length >= 10 ? createdAt.substring(0, 10) : createdAt;
              return ListTile(
                title: Text(
                  item['title'] as String,
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500),
                ),
                subtitle: Text(
                  dateStr,
                  style: const TextStyle(fontSize: 12, color: DoaColors.fgMuted),
                ),
                onTap: () {
                  showDialog<void>(
                    context: context,
                    builder: (_) => AlertDialog(
                      title: Text(item['title'] as String),
                      content: Text(item['content'] as String),
                      actions: [
                        TextButton(
                          onPressed: () => Navigator.pop(context),
                          child: const Text('닫기'),
                        ),
                      ],
                    ),
                  );
                },
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
