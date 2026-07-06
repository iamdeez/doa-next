/**
 * schema.prisma 인덱스 정적 검증 — [env:static] (v1.1.0/019 spec)
 *
 * 대상 SC: SC-007 (FR-006), SC-008 (FR-007)
 * 검증 방법: `fs.readFileSync` 로 `schema.prisma` 텍스트를 파싱하여 `Product`·`Seller`
 *   모델 블록 내 `@@index([...])` 선언에서 선두 컬럼을 확인한다(structure.spec.ts 패턴
 *   재사용). DB 기동·Prisma Client 생성 불필요.
 *
 * 근거(Database Design Agent 산출 확인 완료): `Product`에
 * `@@index([sellerId, createdAt(sort: Desc), id(sort: Desc)])`, `Seller`에
 * `@@index([status, createdAt(sort: Desc), id(sort: Desc)])` 가 이미 추가되어 있다.
 * 인덱스명(Prisma 자동 생성)이 아닌 선두 컬럼·복합 여부만 검증한다(research.md
 * "엣지 케이스 및 한계" — 인덱스명과 무관).
 */

import * as fs from 'fs';
import * as path from 'path';

// apps/backend/test/static/ → 2단계 상위 = apps/backend
const SCHEMA_PATH = path.resolve(__dirname, '../../prisma/schema.prisma');

function extractModelBlock(schema: string, modelName: string): string {
  const re = new RegExp(`model\\s+${modelName}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm');
  const match = schema.match(re);
  if (!match) {
    throw new Error(`model ${modelName} not found in schema.prisma`);
  }
  return match[1];
}

function hasLeadingColumnCompositeIndex(modelBlock: string, leadingColumn: string): boolean {
  const indexMatches = [...modelBlock.matchAll(/@@index\(\[\s*([^\]]+)\]\)/g)];
  return indexMatches.some((m) => {
    const columns = m[1].split(',').map((c) => c.trim());
    return columns.length >= 2 && columns[0].startsWith(leadingColumn);
  });
}

describe('SC-007: Product 모델 — sellerId 선두 복합 인덱스 존재 (FR-006)', () => {
  it('test_SC007_product_model_has_sellerId_leading_composite_index', () => {
    /**
     * SC-007 (v1.1.0/019 spec): `schema.prisma` 의 `Product` 모델에 `sellerId` 를
     * 선두 컬럼으로 하는 복합 인덱스(2개 이상 컬럼)가 존재해야 한다
     * (`ProductRepository.listBySeller` — WHERE sellerId + ORDER BY createdAt DESC,id DESC 커버).
     */
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
    const productBlock = extractModelBlock(schema, 'Product');

    expect(hasLeadingColumnCompositeIndex(productBlock, 'sellerId')).toBe(true);
  });
});

describe('SC-008: Seller 모델 — status 선두 복합 인덱스 존재 (FR-007)', () => {
  it('test_SC008_seller_model_has_status_leading_composite_index', () => {
    /**
     * SC-008 (v1.1.0/019 spec): `schema.prisma` 의 `Seller` 모델에 `status` 를
     * 선두 컬럼으로 하는 복합 인덱스(2개 이상 컬럼)가 존재해야 한다
     * (`SellerRepository.listByStatusPaginated` — WHERE status + ORDER BY createdAt DESC,id DESC 커버).
     */
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
    const sellerBlock = extractModelBlock(schema, 'Seller');

    expect(hasLeadingColumnCompositeIndex(sellerBlock, 'status')).toBe(true);
  });
});
