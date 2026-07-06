import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';

/// 마일리지 포인트 화면 — 잔액 표시 (정산 기능 Out of Scope)
class MileageScreen extends StatelessWidget {
  const MileageScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('마일리지 포인트')),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.monetization_on_outlined, size: 56, color: DoaColors.fgSubtle),
            const SizedBox(height: 16),
            const Text('마일리지 포인트',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            const Text('포인트 내역은 추후 제공됩니다.',
                style: TextStyle(color: DoaColors.fgMuted, fontSize: 14)),
          ],
        ),
      ),
    );
  }
}
