import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/constants.dart';

/// 고객 지원 이메일 문의 — mailto: scheme으로 기본 메일 앱 열기.
/// kSupportEmail(= support@doa.market) 로 문의 (SC-009)
Future<void> openSupportEmail(BuildContext context) async {
  final uri = Uri(
    scheme: 'mailto',
    path: kSupportEmail,
    queryParameters: {'subject': 'DOA 고객 문의'},
  );
  if (await canLaunchUrl(uri)) {
    await launchUrl(uri);
  } else {
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('메일 앱을 열 수 없습니다. $kSupportEmail 으로 문의해주세요.')),
    );
  }
}
