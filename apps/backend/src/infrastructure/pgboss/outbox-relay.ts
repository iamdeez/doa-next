import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import PgBoss = require('pg-boss');
import { OrderService } from '../../modules/order/order.service';
import { PaymentRepository } from '../../modules/payment/payment.repository';
import { OUTBOX_QUEUE } from './pgboss.constants';
import { PgBossService } from './pgboss.service';

/**
 * OutboxRelay — payment_outbox 폴링 → OrderService.markConfirmed 호출.
 * P-001: Payment→Order 직접 DI 순환 회피: OutboxRelay(infra layer)가 양쪽 DI (ADR-007).
 * pg-boss v10 work handler: jobs 배열 수신.
 */
@Injectable()
export class OutboxRelay implements OnModuleInit {
  private readonly logger = new Logger(OutboxRelay.name);
  private boss!: PgBoss;

  constructor(
    private readonly pgBossService: PgBossService,
    private readonly paymentRepository: PaymentRepository,
    private readonly orderService: OrderService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.boss = this.pgBossService.getBoss();

    // PgBossService.onModuleInit 도 동일 큐를 생성하지만, 같은 모듈 내 provider들의
    // onModuleInit 은 NestJS 가 Promise.all 로 동시 실행하므로 순서를 보장하지 않는다.
    // createQueue 는 멱등(ON CONFLICT DO NOTHING)이라 재호출해도 안전 — race condition 방지.
    await this.boss.createQueue(OUTBOX_QUEUE);

    await this.boss.work<{ trigger: string }>(
      OUTBOX_QUEUE,
      { batchSize: 1 },
      async (jobs) => {
        // pg-boss v10: handler receives job array
        for (const _job of jobs) {
          await this.processOutbox();
        }
      },
    );

    // 5초마다 트리거 전송으로 outbox 폴링
    await this.boss.schedule(OUTBOX_QUEUE, '*/5 * * * * *', { trigger: 'poll' });

    this.logger.log('OutboxRelay worker registered');
  }

  private async processOutbox(): Promise<void> {
    const pendingItems = await this.paymentRepository.findPendingOutbox(50);
    for (const item of pendingItems) {
      try {
        const payload = item.payload as { orderId?: string };
        if (item.eventType === 'payment.completed' && payload.orderId) {
          await this.orderService.markConfirmed(payload.orderId);
        }
        await this.paymentRepository.markOutboxProcessed(item.id);
      } catch (err) {
        this.logger.error(`OutboxRelay failed for outbox ${item.id}: ${err}`);
      }
    }
  }
}
