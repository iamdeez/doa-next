import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../shared/auth/jwt.strategy';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentService } from './payment.service';

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  /**
   * POST /payments — 결제 생성.
   * Idempotency-Key 헤더(UUID v4)를 우선, 없으면 body.idempotencyKey 사용.
   * 비-UUID v4 → 400 (FR-031, SC-035).
   * 금액은 서버 측 order.totalAmount 에서 취득 (외부 입력 불신).
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async pay(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePaymentDto,
    @Headers('idempotency-key') headerKey?: string,
  ) {
    const idempotencyKey = headerKey ?? dto.idempotencyKey;

    // UUID v4 형식 검증 — 헤더 경유 값은 class-validator 를 거치지 않으므로 수동 검증
    if (!idempotencyKey || !isUUID(idempotencyKey, '4')) {
      throw new BadRequestException(
        'Idempotency-Key must be a valid UUID v4',
      );
    }

    return this.paymentService.pay(user.userId, dto.orderId, idempotencyKey, dto.authToken);
  }
}
