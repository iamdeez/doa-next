/**
 * 정적 코드 검증 — SC-049/SC-050/SC-053/SC-054/SC-055 [env:static]
 *
 * 대상 SC:
 *   SC-049 (002-catalog, NFR-003 관련) — users/products 스키마 상호 참조 금지
 *   SC-050 (003-commerce, NFR-003 관련) — commerce/orders/payments 크로스 스키마 참조 금지
 *   SC-053 (004-review-coupon) — CouponRepository: commerce 외 모델 직접 참조 금지
 *   SC-054 (004-review-coupon) — ReviewRepository: commerce 외 모델 직접 참조 금지
 *   SC-055 (004-review-coupon) — OrderRepository: 004 신규 commerce 모델(coupon/userCoupon/review) 직접 참조 금지
 *
 * 검증 방법: Node.js fs + 소스 텍스트 파싱
 *
 * 검증 내용:
 *   각 모듈의 Repository 클래스가 자신의 스키마가 아닌
 *   타 도메인 스키마 모델을 Prisma Client 로 직접 참조하지 않음을 확인.
 *
 *   규칙 (002-catalog):
 *   - user 모듈 repository → products 스키마 모델(product, variant, inventory 등) 직접 참조 금지
 *   - seller 모듈 repository → products 스키마 모델 직접 참조 금지
 *   - product 모듈 repository → users 스키마 모델(user, address, wishlist 등) 직접 참조 금지
 *   - inventory 모듈 repository → users 스키마 모델 직접 참조 금지
 *
 *   규칙 (003-commerce, SC-050):
 *   - cart 모듈 repository → products/users/orders/payments 스키마 모델 참조 금지
 *   - order 모듈 repository → products/users/commerce/payments 스키마 모델 참조 금지
 *   - payment 모듈 repository → products/users/commerce/orders 스키마 모델 참조 금지
 *
 * 교차 참조는 NestJS DI (SellerService, UserService 등 주입) 를 통해서만 허용.
 *
 * SC-050 사각지대 차단 (tasks.md research §F):
 *   003 repository 는 this.prisma.tx.{model} (ALS tx-aware) 접근자 사용.
 *   → 002 의 this.prisma.{model} 패턴만 검사하면 003 위반을 탐지하지 못함.
 *   → buildCrossSchemaPattern 은 양 패턴을 모두 검사한다:
 *     (a) this.prisma.{model}
 *     (b) this.prisma.tx.{model}
 */

import * as fs from 'fs';
import * as path from 'path';

const BACKEND_ROOT = path.resolve(__dirname, '../../');

// ─────────────────────────────────────────────
// 스키마 모델 정의
// ─────────────────────────────────────────────

// users 스키마 모델 (Prisma Client 접근자)
const USERS_SCHEMA_MODELS = [
  'user',
  'address',
  'wishlist',
  'productView',
  'seller',
];

// products 스키마 모델 (Prisma Client 접근자)
const PRODUCTS_SCHEMA_MODELS = [
  'product',
  'variant',
  'category',
  'productImage',
  'inventory',
  'inventoryLog',
];

// commerce 스키마 모델 (003-commerce: carts | 004-review-coupon: coupons, user_coupons, reviews)
const COMMERCE_SCHEMA_MODELS = [
  'cart',
  'coupon',
  'userCoupon',
  'review',
];

// orders 스키마 모델 (003-commerce: orders, order_items, order_events 테이블)
const ORDERS_SCHEMA_MODELS = [
  'order',
  'orderItem',
  'orderEvent',
];

// payments 스키마 모델 (003-commerce: payments, refunds, payment_outbox 테이블)
const PAYMENTS_SCHEMA_MODELS = [
  'payment',
  'refund',
  'paymentOutbox',
];

// ─────────────────────────────────────────────
// 각 모듈 Repository 파일과 금지 모델 목록
// ─────────────────────────────────────────────
const CROSS_SCHEMA_RULES: Array<{
  file: string;
  forbiddenModels: string[];
  label: string;
}> = [
  // ── 002-catalog 규칙 (SC-049) ──
  {
    file: 'src/modules/user/user.repository.ts',
    forbiddenModels: PRODUCTS_SCHEMA_MODELS,
    label: 'UserRepository',
  },
  {
    file: 'src/modules/seller/seller.repository.ts',
    forbiddenModels: PRODUCTS_SCHEMA_MODELS,
    label: 'SellerRepository',
  },
  {
    file: 'src/modules/product/product.repository.ts',
    forbiddenModels: USERS_SCHEMA_MODELS,
    label: 'ProductRepository',
  },
  {
    file: 'src/modules/inventory/inventory.repository.ts',
    forbiddenModels: USERS_SCHEMA_MODELS,
    label: 'InventoryRepository',
  },
  // ── 003-commerce 규칙 (SC-050) ──
  // CartRepository: commerce 스키마만 접근 → products/users/orders/payments 금지
  {
    file: 'src/modules/cart/cart.repository.ts',
    forbiddenModels: [
      ...PRODUCTS_SCHEMA_MODELS,
      ...USERS_SCHEMA_MODELS,
      ...ORDERS_SCHEMA_MODELS,
      ...PAYMENTS_SCHEMA_MODELS,
    ],
    label: 'CartRepository (SC-050)',
  },
  // OrderRepository: orders 스키마만 접근 → products/users/commerce/payments 금지
  {
    file: 'src/modules/order/order.repository.ts',
    forbiddenModels: [
      ...PRODUCTS_SCHEMA_MODELS,
      ...USERS_SCHEMA_MODELS,
      ...COMMERCE_SCHEMA_MODELS,
      ...PAYMENTS_SCHEMA_MODELS,
    ],
    label: 'OrderRepository (SC-050)',
  },
  // PaymentRepository: payments 스키마만 접근 → products/users/commerce/orders 금지
  {
    file: 'src/modules/payment/payment.repository.ts',
    forbiddenModels: [
      ...PRODUCTS_SCHEMA_MODELS,
      ...USERS_SCHEMA_MODELS,
      ...COMMERCE_SCHEMA_MODELS,
      ...ORDERS_SCHEMA_MODELS,
    ],
    label: 'PaymentRepository (SC-050)',
  },
  // ── 004-review-coupon 규칙 (SC-053, SC-054) ──
  // CouponRepository: commerce 스키마만 접근 → products/users/orders/payments 금지 (SC-053)
  {
    file: 'src/modules/coupon/coupon.repository.ts',
    forbiddenModels: [
      ...PRODUCTS_SCHEMA_MODELS,
      ...USERS_SCHEMA_MODELS,
      ...ORDERS_SCHEMA_MODELS,
      ...PAYMENTS_SCHEMA_MODELS,
    ],
    label: 'CouponRepository (SC-053)',
  },
  // ReviewRepository: commerce 스키마만 접근 → products/users/orders/payments 금지 (SC-054)
  {
    file: 'src/modules/review/review.repository.ts',
    forbiddenModels: [
      ...PRODUCTS_SCHEMA_MODELS,
      ...USERS_SCHEMA_MODELS,
      ...ORDERS_SCHEMA_MODELS,
      ...PAYMENTS_SCHEMA_MODELS,
    ],
    label: 'ReviewRepository (SC-054)',
  },
  // ── 005-shipping/settlement 규칙 ──
  // ShippingRepository: 자신의 소유 테이블(shipments, shipment_tracking)만 접근.
  // order/order_items/order_events 등 order 모듈 테이블은 OrderService DI 경유 → 직접 참조 금지.
  {
    file: 'src/modules/shipping/shipping.repository.ts',
    forbiddenModels: [
      ...PRODUCTS_SCHEMA_MODELS,
      ...USERS_SCHEMA_MODELS,
      ...COMMERCE_SCHEMA_MODELS,
      ...ORDERS_SCHEMA_MODELS,
      ...PAYMENTS_SCHEMA_MODELS,
    ],
    label: 'ShippingRepository (005)',
  },
  // SettlementRepository: 자신의 소유 테이블(settlements, settlement_items)만 접근.
  // orders 스키마 집계는 OrderService DI 경유 → 직접 참조 금지.
  {
    file: 'src/modules/settlement/settlement.repository.ts',
    forbiddenModels: [
      ...PRODUCTS_SCHEMA_MODELS,
      ...USERS_SCHEMA_MODELS,
      ...COMMERCE_SCHEMA_MODELS,
      ...ORDERS_SCHEMA_MODELS,
      ...PAYMENTS_SCHEMA_MODELS,
    ],
    label: 'SettlementRepository (005)',
  },
  // ── 006-notification/file 규칙 ──
  // NotificationRepository: 자신의 소유 테이블(users.notifications)만 접근.
  // user/seller 등 users 스키마 타 모델 및 타 스키마 모델 직접 참조 금지.
  {
    file: 'src/modules/notification/notification.repository.ts',
    forbiddenModels: [
      ...PRODUCTS_SCHEMA_MODELS,
      ...USERS_SCHEMA_MODELS,
      ...COMMERCE_SCHEMA_MODELS,
      ...ORDERS_SCHEMA_MODELS,
      ...PAYMENTS_SCHEMA_MODELS,
    ],
    label: 'NotificationRepository (006)',
  },
  // FileRepository: 자신의 소유 테이블(files.files = fileAsset)만 접근.
  // owner 조회 등 users 스키마 및 타 스키마 모델 직접 참조 금지.
  {
    file: 'src/modules/file/file.repository.ts',
    forbiddenModels: [
      ...PRODUCTS_SCHEMA_MODELS,
      ...USERS_SCHEMA_MODELS,
      ...COMMERCE_SCHEMA_MODELS,
      ...ORDERS_SCHEMA_MODELS,
      ...PAYMENTS_SCHEMA_MODELS,
    ],
    label: 'FileRepository (006)',
  },
  // ── 007-banner/stats/admin 규칙 ──
  // BannerRepository: 자신의 소유 테이블(admin.banners)만 접근.
  // 타 스키마(users/products/commerce/orders/payments) 모델 직접 참조 금지.
  {
    file: 'src/modules/banner/banner.repository.ts',
    forbiddenModels: [
      ...PRODUCTS_SCHEMA_MODELS,
      ...USERS_SCHEMA_MODELS,
      ...COMMERCE_SCHEMA_MODELS,
      ...ORDERS_SCHEMA_MODELS,
      ...PAYMENTS_SCHEMA_MODELS,
    ],
    label: 'BannerRepository (007)',
  },
  // StatsRepository: 자체 테이블 없음 — 집계는 OrderService/UserService/SellerService DI 경유.
  // 어떤 스키마 모델도 직접 참조하지 않음.
  {
    file: 'src/modules/stats/stats.repository.ts',
    forbiddenModels: [
      ...PRODUCTS_SCHEMA_MODELS,
      ...USERS_SCHEMA_MODELS,
      ...COMMERCE_SCHEMA_MODELS,
      ...ORDERS_SCHEMA_MODELS,
      ...PAYMENTS_SCHEMA_MODELS,
    ],
    label: 'StatsRepository (007)',
  },
  // AdminRepository: admin 스키마 자기 소유 테이블(admin_audit_logs)만 접근(013 GAP-007-01).
  // 타 도메인 데이터는 Seller/User Service DI 경유 — 아래 타 스키마 모델 직접 참조 금지.
  {
    file: 'src/modules/admin/admin.repository.ts',
    forbiddenModels: [
      ...PRODUCTS_SCHEMA_MODELS,
      ...USERS_SCHEMA_MODELS,
      ...COMMERCE_SCHEMA_MODELS,
      ...ORDERS_SCHEMA_MODELS,
      ...PAYMENTS_SCHEMA_MODELS,
    ],
    label: 'AdminRepository (007/013)',
  },
];

/**
 * Prisma Client 접근 패턴 빌더 — SC-050 사각지대 차단 핵심.
 *
 * 002 레거시 패턴:    this.prisma.{model}
 * 003 tx-aware 패턴: this.prisma.tx.{model}
 *
 * 두 패턴 모두 검사하여 ALS 기반 repo 의 위반도 탐지.
 */
function buildCrossSchemaPattern(modelName: string): RegExp {
  // OR 로 양 패턴 결합:
  //   (a) this.prisma.{model}.xxx  (002 레거시)
  //   (b) this.prisma.tx.{model}.xxx  (003 tx-aware)
  return new RegExp(
    `this\\.prisma\\.(?:tx\\.)?${modelName}\\b`,
    'g',
  );
}

describe('SC-049/SC-050/SC-053/SC-054/SC-055: 크로스 스키마 Prisma 직접 참조 금지 정적 검증', () => {
  for (const rule of CROSS_SCHEMA_RULES) {
    it(`when_inspect_${rule.label.replace(/[^a-zA-Z0-9]/g, '_')}_then_no_cross_schema_prisma_access`, () => {
      /**
       * 각 모듈 Repository 는 자신의 스키마 테이블만 Prisma 로 접근해야 한다.
       * 타 도메인 스키마 모델에 this.prisma.{model} 또는 this.prisma.tx.{model}
       * 형태로 직접 접근하면 위반.
       *
       * SC-050 (003): cart/order/payment repo 의 this.prisma.tx.{model} 패턴도 검사.
       */
      const filePath = path.join(BACKEND_ROOT, rule.file);

      if (!fs.existsSync(filePath)) {
        // TDD Red: 파일 미생성 — Green 전환 후 이 검증 활성화.
        return;
      }

      const source = fs.readFileSync(filePath, 'utf-8');
      const violations: string[] = [];

      for (const modelName of rule.forbiddenModels) {
        const pattern = buildCrossSchemaPattern(modelName);
        const matches = source.match(pattern);
        if (matches) {
          violations.push(
            `${rule.label} → this.prisma[.tx].${modelName} 접근 감지 (${matches.length}건): ${matches.join(', ')}`,
          );
        }
      }

      if (violations.length > 0) {
        throw new Error(
          `크로스 스키마 위반:\n${violations.join('\n')}\n\n` +
          `교차 참조는 NestJS DI (Service 주입) 를 통해서만 허용.`,
        );
      }

      expect(violations).toHaveLength(0);
    });
  }
});
