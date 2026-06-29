import 'package:flutter_test/flutter_test.dart';

import 'package:doa_customer_app/theme/app_theme.dart';

void main() {
  test('AppTheme.light 생성 — DOA 블루 primary', () {
    final theme = AppTheme.light();
    expect(theme.colorScheme.primary, DoaColors.blue);
    expect(theme.useMaterial3, true);
  });
}
