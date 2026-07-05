import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { LoggerModule } from 'nestjs-pino';
import { PgBossModule } from './infrastructure/pgboss/pgboss.module';
import { HealthModule } from './health/health.module';
import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
import { BannerModule } from './modules/banner/banner.module';
import { CartModule } from './modules/cart/cart.module';
import { CouponModule } from './modules/coupon/coupon.module';
import { FileModule } from './modules/file/file.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { NotificationModule } from './modules/notification/notification.module';
import { OrderModule } from './modules/order/order.module';
import { PaymentModule } from './modules/payment/payment.module';
import { ProductModule } from './modules/product/product.module';
import { ReviewModule } from './modules/review/review.module';
import { SearchModule } from './modules/search/search.module';
import { SellerModule } from './modules/seller/seller.module';
import { SettlementModule } from './modules/settlement/settlement.module';
import { ShippingModule } from './modules/shipping/shipping.module';
import { StatsModule } from './modules/stats/stats.module';
import { UserModule } from './modules/user/user.module';
import { AppConfigModule } from './shared/config/config.module';
import { PrismaModule } from './shared/prisma/prisma.module';
import { SecurityModule } from './shared/security/security.module';

@Module({
  imports: [
    // Infrastructure
    AppConfigModule,
    LoggerModule.forRoot({
      pinoHttp: {
        redact: ['req.headers.authorization', 'req.headers.cookie'],
        transport:
          process.env['NODE_ENV'] !== 'production'
            ? { target: 'pino-pretty' }
            : undefined,
      },
    }),
    EventEmitterModule.forRoot(),
    PrismaModule,
    PgBossModule,
    SecurityModule,

    // Core
    HealthModule,

    // Auth (real implementation)
    AuthModule,

    // Domain stubs
    UserModule,
    SellerModule,
    ProductModule,
    InventoryModule,
    CartModule,
    CouponModule,
    OrderModule,
    PaymentModule,
    ShippingModule,
    SettlementModule,
    ReviewModule,
    SearchModule,
    NotificationModule,
    FileModule,
    BannerModule,
    StatsModule,
    AdminModule,
  ],
})
export class AppModule {}
