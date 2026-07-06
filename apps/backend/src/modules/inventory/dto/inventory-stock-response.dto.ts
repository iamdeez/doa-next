import { ApiProperty } from '@nestjs/swagger';

/** GET /inventory/:variantId/stock, POST /inventory/:variantId/stock-in 응답 (017). */
export class InventoryStockResponse {
  @ApiProperty()
  variantId!: string;

  @ApiProperty()
  stock!: number;
}
