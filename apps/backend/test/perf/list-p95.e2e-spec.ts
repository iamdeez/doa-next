/**
 * 목록 API P95 응답시간 측정 — [env:integration] (v1.1.0/017 spec)
 *
 * 대상 SC: SC-018 (NFR-001 관련)
 * 검증 방법: 실제 NestJS 앱 기동 + PostgreSQL 연결 + HTTP 요청 × 100회 → P95 측정
 *   (test/products.e2e-spec.ts 의 SC-047(v1.0.0/002 spec) P95 측정 패턴 재사용)
 *
 * 측정 대상 (spec.md SC-018, tasks.md T022):
 *   1. GET /admin/sellers/pending?limit=20 — 관리자 판매자 목록 (FR-002)
 *   2. GET /sellers/me/products?limit=20  — 판매자 본인 상품 목록 (FR-006)
 *
 * SC-018 통합/성능 검증 defer 결정 (plan.md PATCH-A08/PROC-010, 사용자 옵션 A 확정):
 *   main session 이 환경 구성 절차를 사용자에게 제시 → 사용자가 docker-compose 로 로컬 PostgreSQL을
 *   기동하고 데이터(1,000건 미만)를 준비한 뒤 본 테스트를 실행 → 결과를 5b Test Agent(EXECUTION)에
 *   전달하여 P95 판정을 완료한다. 본 5a AUTHORING 단계는 측정 harness/시나리오만 작성한다.
 *
 * 실행 전제:
 *   1. docker compose up -d (또는 로컬 PostgreSQL 기동)
 *   2. DATABASE_URL, JWT_ACCESS_SECRET 환경 변수 설정
 *   3. 최소 1개의 Category 행 존재(FK 참조) — 없으면 관리자 목록만 측정되고 판매자 목록은 스킵
 *   4. ADMIN_USER_IDS 는 본 파일이 앱 부팅 전에 주입한다.
 *   5. pnpm --filter backend test:e2e -- list-p95
 *
 * P95 기준: 500ms 이하 (NFR-001, 로컬 docker-compose 환경·데이터 1,000건 미만 조건)
 *
 * 픽스처 정책:
 *   판매자 목록 측정을 위해 본 테스트가 직접 APPROVED 판매자 1건 + 상품 N건을 PrismaService 로
 *   시딩한다(auth-recovery.e2e-spec.ts 의 직접 prisma upsert/cleanup 패턴 재사용). 외부 사전 시딩에
 *   의존하지 않아 재현성을 확보한다. afterAll 에서 생성한 데이터를 정리한다.
 */

import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';

const ADMIN_ID = 'e2e-admin-017-perf';
const SELLER_USER_ID = 'e2e-seller-017-perf';

// AppModule import·부팅 전에 ADMIN_USER_IDS 주입 (dotenv override:false → 유지, banner-admin.e2e 패턴)
process.env.ADMIN_USER_IDS = process.env.ADMIN_USER_IDS
  ? `${process.env.ADMIN_USER_IDS},${ADMIN_ID}`
  : ADMIN_ID;

// eslint-disable-next-line @typescript-eslint/no-var-requires
import { AppModule } from '../../src/app.module';
// eslint-disable-next-line @typescript-eslint/no-var-requires
import { PrismaService } from '../../src/shared/prisma/prisma.service';

const P95_THRESHOLD_MS = 500;
const REPEAT_COUNT = 100;
const P95_INDEX = Math.floor(REPEAT_COUNT * 0.95);
const SEED_PRODUCT_COUNT = 30; // 1,000건 미만 조건 내 대표 표본

function calcP95(durations: number[]): number {
  const sorted = [...durations].sort((a, b) => a - b);
  return sorted[P95_INDEX - 1] ?? sorted[sorted.length - 1];
}

function isEnvReady(): boolean {
  return !!(process.env.DATABASE_URL && process.env.JWT_ACCESS_SECRET);
}

/** REPEAT_COUNT 회 GET 요청을 보내고 P95/avg/max/min 을 계산한다. */
async function measureP95(
  app: INestApplication,
  path: string,
  token: string,
): Promise<{ p95: number; avg: number; max: number; min: number }> {
  const durations: number[] = [];
  for (let i = 0; i < REPEAT_COUNT; i++) {
    const start = Date.now();
    await request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    durations.push(Date.now() - start);
  }
  const p95 = calcP95(durations);
  const avg = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
  return { p95, avg, max: Math.max(...durations), min: Math.min(...durations) };
}

describe('SC-018: 목록 API(관리자 판매자·판매자 상품) P95 ≤ 500ms', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let sellerToken: string;
  let seededSellerId: string | undefined;
  let seededCategoryId: string | undefined;
  const seededProductIds: string[] = [];

  beforeAll(async () => {
    if (!isEnvReady()) return;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = moduleFixture.get<PrismaService>(PrismaService);

    const jwt = new JwtService({ secret: process.env.JWT_ACCESS_SECRET });
    adminToken = jwt.sign({ sub: ADMIN_ID, email: 'admin-perf@e2e.test' });
    sellerToken = jwt.sign({ sub: SELLER_USER_ID, email: 'seller-perf@e2e.test' });

    // 판매자 상품 목록 측정용 시드: User → Seller(APPROVED) → Category(기존 재사용) → Product N건
    await prisma.user.upsert({
      where: { id: SELLER_USER_ID },
      create: { id: SELLER_USER_ID, email: 'seller-perf@e2e.test' },
      update: {},
    });
    const seller = await prisma.seller.upsert({
      where: { userId: SELLER_USER_ID },
      create: {
        userId: SELLER_USER_ID,
        businessName: 'P95 측정 판매자',
        businessNumber: '000-00-00000',
        representativeName: '측정용',
        status: 'APPROVED',
      },
      update: { status: 'APPROVED' },
    });
    seededSellerId = seller.id;

    const category = await prisma.category.findFirst();
    if (category) {
      seededCategoryId = category.id;
      for (let i = 0; i < SEED_PRODUCT_COUNT; i++) {
        const product = await prisma.product.create({
          data: {
            sellerId: seller.id,
            categoryId: category.id,
            title: `P95 측정 상품 ${i}`,
            price: '1000',
            status: 'ACTIVE',
          },
        });
        seededProductIds.push(product.id);
      }
    }
  });

  afterAll(async () => {
    if (!app || !prisma) return;
    if (seededProductIds.length > 0) {
      await prisma.product.deleteMany({ where: { id: { in: seededProductIds } } });
    }
    if (seededSellerId) {
      await prisma.seller.deleteMany({ where: { id: seededSellerId } });
    }
    await prisma.user.deleteMany({ where: { id: SELLER_USER_ID } });
    await app.close();
  });

  it('when_admin_lists_pending_sellers_100_times_then_p95_under_500ms', async () => {
    /**
     * SC-018 (NFR-001 관련, v1.1.0/017 spec):
     * GET /admin/sellers/pending?limit=20 을 100회 반복 호출하여 P95 응답시간 측정.
     * P95 ≤ 500ms.
     */
    if (!isEnvReady() || !app) {
      console.warn(
        'SC-018 SKIP (admin/sellers/pending): DATABASE_URL/JWT_ACCESS_SECRET 미설정.\n' +
          '통합 테스트 환경을 구성하고 재실행하세요:\n' +
          '  docker compose up -d\n' +
          '  DATABASE_URL=... JWT_ACCESS_SECRET=... pnpm --filter backend test:e2e -- list-p95',
      );
      return;
    }

    const { p95, avg, max, min } = await measureP95(
      app,
      '/admin/sellers/pending?limit=20',
      adminToken,
    );
    console.log(`SC-018 (admin/sellers/pending) 성능 결과: P95=${p95}ms, avg=${avg}ms, max=${max}ms, min=${min}ms`);

    expect(p95).toBeLessThanOrEqual(P95_THRESHOLD_MS);
  }, 60_000);

  it('when_seller_lists_own_products_100_times_then_p95_under_500ms', async () => {
    /**
     * SC-018 (NFR-001 관련, v1.1.0/017 spec):
     * GET /sellers/me/products?limit=20 을 100회 반복 호출하여 P95 응답시간 측정.
     * P95 ≤ 500ms. Category 시드가 없으면(로컬 최초 마이그레이션 직후) 스킵.
     */
    if (!isEnvReady() || !app || !seededCategoryId) {
      console.warn(
        'SC-018 SKIP (sellers/me/products): DATABASE_URL/JWT_ACCESS_SECRET 미설정 또는 ' +
          'Category 시드 데이터 부재. 최소 1개의 Category 를 시딩한 뒤 재실행하세요.',
      );
      return;
    }

    const { p95, avg, max, min } = await measureP95(
      app,
      '/sellers/me/products?limit=20',
      sellerToken,
    );
    console.log(`SC-018 (sellers/me/products) 성능 결과: P95=${p95}ms, avg=${avg}ms, max=${max}ms, min=${min}ms`);

    expect(p95).toBeLessThanOrEqual(P95_THRESHOLD_MS);
  }, 60_000);
});
