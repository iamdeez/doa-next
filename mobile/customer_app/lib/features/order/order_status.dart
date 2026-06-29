import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';

/// 주문 상태 한글 라벨 + 배지 톤. 백엔드 OrderStatus enum 과 1:1.
const orderStatusLabel = <String, String>{
  'pending': '결제대기',
  'confirmed': '결제완료',
  'preparing': '상품준비',
  'shipped': '배송중',
  'delivered': '배송완료',
  'completed': '구매확정',
  'cancelled': '주문취소',
};

/// (글자색, 배경색) — 배지 렌더링용.
({Color fg, Color bg}) orderStatusTone(String status) {
  switch (status) {
    case 'cancelled':
      return (fg: DoaColors.danger, bg: const Color(0xFFFDECEC));
    case 'completed':
    case 'delivered':
      return (fg: const Color(0xFF1F8A4C), bg: const Color(0xFFE7F6ED));
    default:
      return (fg: DoaColors.blue, bg: DoaColors.blueSoft);
  }
}

String orderStatusText(String status) => orderStatusLabel[status] ?? status;
