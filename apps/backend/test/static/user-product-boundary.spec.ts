/**
 * 정적 코드 검증 — SC-021 [env:static] (v1.1.0/017 spec)
 *
 * 대상 SC:
 *   SC-021 (NFR-004 관련) — user 모듈(Repository/Service)이 products 스키마 Prisma 모델을
 *   직접 참조하지 않고, product 모듈의 공개 서비스 메서드(DI)만을 통해 상품 정보를 조회함을 확인.
 *
 * 검증 방법: Node.js fs + 소스 텍스트 파싱 (test/static/cross-schema.spec.ts 패턴 재사용)
 *
 * 배경 (research.md §F, plan.md P-001 Gate):
 *   FR-010~012(위시리스트·최근 본 상품 상품 요약)는 UserService 생성자에 ProductService 를 신규
 *   주입하여 getPublicSummaries(ids) 로만 상품 정보를 조회한다. user.repository.ts 는 무변경이며
 *   (NFR-004), UserService 도 Prisma product/variant 등 products 스키마 모델을 직접 참조해서는
 *   안 된다.
 *
 *   test/static/cross-schema.spec.ts 는 *.repository.ts 파일만 검사 대상으로 하므로
 *   (§ 규칙표에 user.repository.ts 는 이미 포함), user.service.ts 를 포함한 신규 정적 검증을
 *   본 파일로 분리한다(tasks.md T020).
 */

import * as fs from 'fs';
import * as path from 'path';

const BACKEND_ROOT = path.resolve(__dirname, '../../');

// products 스키마 Prisma Client 접근자 (test/static/cross-schema.spec.ts 와 동일 목록)
const PRODUCTS_SCHEMA_MODELS = [
  'product',
  'variant',
  'category',
  'productImage',
  'inventory',
  'inventoryLog',
];

// user 모듈 소스 — products 스키마 직접 참조 금지 대상 (SC-021)
const USER_MODULE_FILES = [
  'src/modules/user/user.repository.ts',
  'src/modules/user/user.service.ts',
];

/**
 * Prisma Client 접근 패턴 — this.prisma.{model} 및 this.prisma.tx.{model}(ALS tx-aware) 양 패턴 검사.
 * (cross-schema.spec.ts buildCrossSchemaPattern 과 동일 전략)
 */
function buildCrossSchemaPattern(modelName: string): RegExp {
  return new RegExp(`this\\.prisma\\.(?:tx\\.)?${modelName}\\b`, 'g');
}

describe('SC-021: user 모듈 products 스키마 직접 참조 금지 정적 검증', () => {
  it('when_inspect_user_module_then_no_direct_products_prisma_access', () => {
    /**
     * SC-021 (NFR-004 관련, v1.1.0/017 spec):
     * user.repository.ts·user.service.ts 소스에 products 스키마 Prisma 모델
     * (this.prisma.product / this.prisma.tx.product 등) 직접 참조가 0건이어야 한다.
     */
    const violations: string[] = [];

    for (const relPath of USER_MODULE_FILES) {
      const filePath = path.join(BACKEND_ROOT, relPath);

      if (!fs.existsSync(filePath)) {
        // TDD Red: 파일 미생성 — Green 전환 후 이 검증 활성화.
        continue;
      }

      const source = fs.readFileSync(filePath, 'utf-8');

      for (const modelName of PRODUCTS_SCHEMA_MODELS) {
        const pattern = buildCrossSchemaPattern(modelName);
        const matches = source.match(pattern);
        if (matches) {
          violations.push(
            `${relPath} → this.prisma[.tx].${modelName} 접근 감지 (${matches.length}건): ${matches.join(', ')}`,
          );
        }
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `SC-021 위반 — user 모듈이 products 스키마를 직접 참조:\n${violations.join('\n')}\n\n` +
          `상품 정보 조회는 ProductService.getPublicSummaries(ids) DI 경유로만 허용된다 (NFR-004).`,
      );
    }

    expect(violations).toHaveLength(0);
  });

  it('when_inspect_user_service_then_product_summaries_use_di_call', () => {
    /**
     * SC-021 (NFR-004 관련, v1.1.0/017 spec) 보강:
     * user.service.ts 가 상품 요약을 조회하는 경우 반드시 productService.getPublicSummaries(...)
     * 형태의 DI 메서드 호출을 거쳐야 한다(단순 부재 검증을 넘어 양성 경로 존재 확인).
     * TDD Red 단계에서는 파일에 아직 enrichment 로직이 없을 수 있으므로, 존재하는 경우에만 검사한다.
     */
    const filePath = path.join(BACKEND_ROOT, 'src/modules/user/user.service.ts');
    if (!fs.existsSync(filePath)) return;

    const source = fs.readFileSync(filePath, 'utf-8');

    // wishlist/recentView 항목 보강 로직이 존재하는지(017 구현 완료 여부) 우선 판별.
    // 아직 미구현(TDD Red)이면 이 검증은 건너뛴다 — SC-014~017 단위 테스트가 동작 자체를 검증한다.
    const hasProductAvailableField = /productAvailable/.test(source);
    if (!hasProductAvailableField) return;

    expect(/this\.productService\.getPublicSummaries\(/.test(source)).toBe(true);
  });
});
