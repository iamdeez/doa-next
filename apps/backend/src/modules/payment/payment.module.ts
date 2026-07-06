import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthSharedModule } from '../../shared/auth/auth-shared.module';
import { OrderModule } from '../order/order.module';
import { IniisisPaymentGateway } from './inicis-payment-gateway';
import { inicisConfig } from './inicis.config';
import { PaymentController } from './payment.controller';
import { PAYMENT_GATEWAY, PaymentGatewayPort } from './payment-gateway.port';
import { PaymentRepository } from './payment.repository';
import { PaymentService } from './payment.service';
import { StubPaymentGateway } from './stub-payment-gateway';

@Module({
  imports: [
    AuthSharedModule,
    ConfigModule.forFeature(inicisConfig),
    // Order↔Payment 순환 참조 → forwardRef 해소 (ADR-007)
    forwardRef(() => OrderModule),
  ],
  controllers: [PaymentController],
  providers: [
    PaymentService,
    PaymentRepository,
    {
      provide: PAYMENT_GATEWAY,
      // ADR-005: PAYMENT_PROVIDER env 기반 선택. 미설정·미인식 값은 stub(default) —
      // payments.e2e-spec.ts 가 gateway override 없이 AppModule 을 부팅하므로 회귀 방지 필수.
      useFactory: (configService: ConfigService): PaymentGatewayPort => {
        const provider = configService.get<string>('PAYMENT_PROVIDER');
        return provider === 'inicis'
          ? new IniisisPaymentGateway(configService)
          : new StubPaymentGateway();
      },
      inject: [ConfigService],
    },
  ],
  exports: [PaymentService, PaymentRepository],
})
export class PaymentModule {}
