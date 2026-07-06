import { BadRequestException, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InventoryLogType } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { InsufficientStockException } from './inventory.exception';
import { InventoryRepository } from './inventory.repository';

export interface StockChangedEvent {
  productId: string;
  totalStock: number;
}

/** 재고 조회·입고 응답 구조 (017). */
export interface InventoryStockView {
  variantId: string;
  stock: number;
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly inventoryRepository: InventoryRepository,
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * variant 생성 시 재고 행 초기화 (FR-030, plan 인터페이스 계약).
   * quantity 음수 금지.
   */
  async initStock(variantId: string, productId: string, quantity: number): Promise<void> {
    if (quantity < 0) {
      throw new BadRequestException('Initial quantity must not be negative');
    }
    await this.inventoryRepository.createInventory({ variantId, productId, quantity });
    await this.inventoryRepository.appendLog({
      variantId,
      productId,
      type: InventoryLogType.INIT,
      delta: quantity,
    });
  }

  /**
   * 재고 입고 + 커밋 후 이벤트 발행 (FR-030, SC-041).
   * 응답 구조화(017): increment 커밋 후 최신 수량을 재조회하여 { variantId, stock } 반환.
   * 재조회는 이미 커밋된 값을 읽으므로 원자성·기존 emit 순서에 영향 없음.
   */
  async stockIn(variantId: string, quantity: number): Promise<InventoryStockView> {
    const inv = await this.inventoryRepository.findByVariant(variantId);
    if (!inv) throw new BadRequestException('Inventory not found for variant');

    await this.inventoryRepository.increment(variantId, quantity);
    await this.inventoryRepository.appendLog({
      variantId,
      productId: inv.productId,
      type: InventoryLogType.STOCK_IN,
      delta: quantity,
    });

    // 트랜잭션 커밋 이후 이벤트 발행 (onAfterCommit: ALS 활성 시 훅 등록, 비활성 시 즉시 실행)
    await this.prisma.onAfterCommit(() => this.emitStockChanged(inv.productId));

    const updated = await this.inventoryRepository.findByVariant(variantId);
    return { variantId, stock: updated?.quantity ?? 0 };
  }

  /** 현재 재고 수량 조회 (FR-031, SC-042) — cart/order 등 내부 소비자용 원시 숫자 반환은 보존(017). */
  async getStock(variantId: string): Promise<number> {
    const inv = await this.inventoryRepository.findByVariant(variantId);
    if (!inv) return 0;
    return inv.quantity;
  }

  /** 재고 조회 응답 구조화 (017) — controller 전용. */
  async getStockView(variantId: string): Promise<InventoryStockView> {
    return { variantId, stock: await this.getStock(variantId) };
  }

  /**
   * 가용 재고 확인 (FR-033, SC-044). 부수효과 없음.
   * plan 인터페이스 계약: checkAvailability(variantId: string, quantity: number): Promise<boolean>
   */
  async checkAvailability(variantId: string, quantity: number): Promise<boolean> {
    const inv = await this.inventoryRepository.findByVariant(variantId);
    if (!inv) return false;
    return inv.quantity >= quantity;
  }

  /**
   * 원자적 재고 차감 (FR-034·035, SC-045·046).
   * plan 인터페이스 계약: decreaseStock(variantId: string, quantity: number, orderId: string): Promise<void>
   * count=0 → InsufficientStockException.
   */
  async decreaseStock(variantId: string, quantity: number, orderId: string): Promise<void> {
    const inv = await this.inventoryRepository.findByVariant(variantId);
    if (!inv) throw new InsufficientStockException();

    const result = await this.inventoryRepository.conditionalDecrement(variantId, quantity);
    if (result.count === 0) {
      throw new InsufficientStockException();
    }

    await this.inventoryRepository.appendLog({
      variantId,
      productId: inv.productId,
      type: InventoryLogType.DECREASE,
      delta: -quantity,
      orderId,
    });

    // 트랜잭션 커밋 이후 이벤트 발행
    await this.prisma.onAfterCommit(() => this.emitStockChanged(inv.productId));
  }

  /**
   * 재고 복원 — 주문 취소 시 차감분 되돌리기 (FR-036).
   * orderId: 복원 사유 추적용 로그 참조.
   */
  async restoreStock(variantId: string, quantity: number, orderId: string): Promise<void> {
    const inv = await this.inventoryRepository.findByVariant(variantId);
    if (!inv) throw new BadRequestException(`Inventory not found for variant: ${variantId}`);

    await this.inventoryRepository.increment(variantId, quantity);
    await this.inventoryRepository.appendLog({
      variantId,
      productId: inv.productId,
      type: InventoryLogType.RESTORE,
      delta: quantity,
      orderId,
    });

    await this.prisma.onAfterCommit(() => this.emitStockChanged(inv.productId));
  }

  private async emitStockChanged(productId: string): Promise<void> {
    const totalStock = await this.inventoryRepository.sumQuantityByProduct(productId);
    const event: StockChangedEvent = { productId, totalStock };
    this.eventEmitter.emit('inventory.stock-changed', event);
  }
}
