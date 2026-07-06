/**
 * 매핑 명세 완결성 정적 검증 — [env:static] (v1.1.0/020 spec)
 *
 * 대상 SC: SC-011 (FR-009), SC-012 (FR-010)
 * 검증 방법: `fs.readFileSync` 로 `scripts/migration/MAPPING-SPEC.md` 와
 *   `apps/backend/prisma/schema.prisma` 를 파싱한다. DB 기동·레거시 접속 불필요
 *   (신규 33테이블 실체는 schema.prisma 자체 실측으로 확정 가능 — 레거시側는
 *   T001 산출물의 [TO-VERIFY] 마커 대상이므로 본 테스트 범위 밖).
 *
 * 근거: tasks.md T011 — `MAPPING-SPEC.md` 파싱, 신규 33테이블(schema.prisma
 *   `@@map` 전수) 이 매핑표에 최소 1회 등장(SC-011) + "1:1 아님" 항목 전건
 *   변환 규칙 기재(SC-012).
 */

import * as fs from 'fs';
import * as path from 'path';

// apps/backend/test/static/ → 4단계 상위 = repo-root (PROC-014-03 하네스 canonical)
const SCHEMA_PATH = path.resolve(__dirname, '../../prisma/schema.prisma');
const MAPPING_SPEC_PATH = path.resolve(
  __dirname,
  '../../../../scripts/migration/MAPPING-SPEC.md',
);

interface TargetTable {
  model: string;
  schema: string;
  table: string;
}

/**
 * schema.prisma 를 model 블록 단위로 분리하고, 각 블록의 `@@map`/`@@schema`
 * 선언에서 (schema, table) 쌍을 추출한다. 두 선언이 모두 있는 모델만
 * "신규 33테이블"에 해당한다(선언 없는 모델은 없음 — 전체 실측 확인 완료).
 */
function extractTargetTables(schemaContent: string): TargetTable[] {
  const modelBlockRe = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
  const tables: TargetTable[] = [];
  let match: RegExpExecArray | null;
  while ((match = modelBlockRe.exec(schemaContent)) !== null) {
    const [, modelName, body] = match;
    const mapMatch = body.match(/@@map\("([^"]+)"\)/);
    const schemaMatch = body.match(/@@schema\("([^"]+)"\)/);
    if (mapMatch && schemaMatch) {
      tables.push({ model: modelName, schema: schemaMatch[1], table: mapMatch[1] });
    }
  }
  return tables;
}

/**
 * 마크다운 테이블 데이터 행(파이프 구분)에서 "1:1여부" 열 값이 정확히
 * "아님" 또는 "**아님**" 인 행만 추출한다. 본문 서술(prose) 중 "아님" 단어가
 * 등장하는 경우(예: "검증 대상 아님")는 셀 값이 정확히 일치하지 않으므로
 * 제외된다 — substring 검색 대신 cell 단위 정확 매칭을 사용하는 이유.
 */
function extractNonOneToOneRows(mappingSpec: string): string[] {
  return mappingSpec
    .split('\n')
    .filter((line) => line.trim().startsWith('|') && !/^\|[\s-]+\|/.test(line.trim()))
    .filter((line) => {
      const cells = line.split('|').map((c) => c.trim());
      return cells.some((c) => c === '아님' || c === '**아님**');
    });
}

describe('SC-011: 매핑표 신규 33테이블 전부 등장 (FR-009)', () => {
  const schemaContent = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  const mappingSpec = fs.readFileSync(MAPPING_SPEC_PATH, 'utf-8');
  const targetTables = extractTargetTables(schemaContent);

  it('test_SC011_schema_prisma_has_33_mapped_models', () => {
    /**
     * SC-011 (v1.1.0/020 spec) 전제 확인: schema.prisma 자체가 33개 모델을
     * @@map/@@schema 선언과 함께 가져야 한다(research.md·MAPPING-SPEC.md §11 실측치).
     */
    expect(targetTables.length).toBe(33);
  });

  it.each([
    ['users', 'users'],
    ['users', 'social_accounts'],
    ['users', 'refresh_tokens'],
    ['users', 'sellers'],
    ['users', 'addresses'],
    ['users', 'wishlists'],
    ['users', 'product_views'],
    ['users', 'password_reset_otps'],
    ['users', 'oauth_states'],
    ['users', 'notifications'],
    ['products', 'categories'],
    ['products', 'products'],
    ['products', 'product_images'],
    ['products', 'variants'],
    ['products', 'inventory'],
    ['products', 'inventory_logs'],
    ['commerce', 'carts'],
    ['commerce', 'coupons'],
    ['commerce', 'user_coupons'],
    ['commerce', 'reviews'],
    ['orders', 'orders'],
    ['orders', 'order_items'],
    ['orders', 'order_events'],
    ['orders', 'shipments'],
    ['orders', 'shipment_tracking'],
    ['payments', 'payments'],
    ['payments', 'refunds'],
    ['payments', 'payment_outbox'],
    ['settlements', 'settlements'],
    ['settlements', 'settlement_items'],
    ['admin', 'banners'],
    ['admin', 'admin_audit_logs'],
    ['files', 'files'],
  ])('test_SC011_target_table_%s_%s_appears_in_mapping_spec', (schema, table) => {
    /**
     * SC-011 (v1.1.0/020 spec): 신규 스키마의 모든 테이블이 매핑표에 최소
     * 1회 이상 등장해야 한다. 식별자는 schema.prisma `@@map`(테이블명) +
     * `@@schema`(스키마명) 조합("schema.table" 표기, MAPPING-SPEC.md §0 표기법).
     */
    expect(mappingSpec).toContain(`${schema}.${table}`);
  });

  it('test_SC011_no_target_table_missing_from_mapping_spec', () => {
    /**
     * SC-011 역방향 검증 — schema.prisma 실측 33테이블 중 매핑표에 등장하지
     * 않는 테이블이 0건임을 집합 연산으로 재확인한다(위 it.each 개별 확인의
     * 종합 카운트 검증).
     */
    const missing = targetTables.filter((t) => !mappingSpec.includes(`${t.schema}.${t.table}`));
    expect(missing).toEqual([]);
  });
});

describe('SC-012: "1:1 아님" 항목 전건 변환 규칙 기재 (FR-010)', () => {
  const mappingSpec = fs.readFileSync(MAPPING_SPEC_PATH, 'utf-8');
  const nonOneToOneRows = extractNonOneToOneRows(mappingSpec);

  it('test_SC012_at_least_one_non_one_to_one_row_exists', () => {
    /**
     * SC-012 (v1.1.0/020 spec) 전제 확인: "1:1 아님" 표기 행이 실제로
     * 존재해야 아래 변환 규칙 기재 검증이 의미를 갖는다(공집합 통과 방지).
     */
    expect(nonOneToOneRows.length).toBeGreaterThan(0);
  });

  it('test_SC012_every_non_one_to_one_row_references_transform_rule_section', () => {
    /**
     * SC-012 (v1.1.0/020 spec): 매핑표 내 "1:1 아님"으로 표시된 각 항목에
     * 변환 규칙 설명이 누락 없이 기재되어 있어야 한다. MAPPING-SPEC.md 는
     * 변환 규칙을 "§8-N" 형식의 절 참조로 기재하는 컨벤션을 사용하므로
     * (§0 작성 원칙), 각 "아님" 행이 동일 행 내에 `§8-\d` 참조를 포함하는지
     * 확인한다(행 밖 별도 절 설명이 아닌 행 자체의 참조 유무로 누락 판정).
     */
    const rowsWithoutReference = nonOneToOneRows.filter((row) => !/§8-\d/.test(row));
    expect(rowsWithoutReference).toEqual([]);
  });
});
