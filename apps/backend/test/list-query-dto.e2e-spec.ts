/**
 * 목록 API 쿼리 DTO 검증 통합 테스트 — [env:integration] (v1.1.0/019 spec)
 *
 * 대상 SC: SC-001~006 (FR-001~005, NFR-001)
 * 검증 방법: `Test.createTestingModule({imports:[AppModule]})` 독립 앱 + supertest.
 *   전역 `ValidationPipe({whitelist:true, forbidNonWhitelisted:true, transform:true})`가
 *   신규 `ListQueryDto`/`AdminSellerListQueryDto` 를 검증한다(§F — 개별 `@Query()`+`parseInt`
 *   수동 변환 제거, tasks.md Test Authoring Contract canonical).
 *
 * 실행 전제 (rate-limit.e2e-spec.ts/list-p95.e2e-spec.ts 와 동일한 옵션 A 패턴):
 *   1. docker compose up -d (PostgreSQL 16)
 *   2. pnpm --filter backend exec prisma migrate dev
 *   3. .env 환경변수 설정 (DATABASE_URL, JWT_ACCESS_SECRET)
 *   4. pnpm --filter backend test:e2e -- list-query-dto
 *
 * 픽스처 정책: `/sellers/me/products` 는 승인(APPROVED) 판매자가 없으면
 * `ProductService.listMyProducts` 가 `getApprovedSeller` 단계에서 예외를 던지므로,
 * SC-006(유효 limit 200 응답) 검증을 위해 User→Seller(APPROVED) 1건을 직접 시딩한다
 * (list-p95.e2e-spec.ts 의 prisma upsert/cleanup 패턴 재사용). SC-001~005(에러·경계값)는
 * `JwtAuthGuard` 통과 이후 `ValidationPipe` 가 컨트롤러 진입 전에 400 을 반환하므로
 * (Guard → Pipe → Handler 순서, research.md "엣지 케이스 및 한계") 시딩이 불필요하다.
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';

const ADMIN_ID = 'e2e-admin-019-list-query';
const SELLER_USER_ID = 'e2e-seller-019-list-query';

// AppModule import·부팅 전에 ADMIN_USER_IDS 주입 (dotenv override:false → 유지, banner-admin.e2e 패턴)
process.env.ADMIN_USER_IDS = process.env.ADMIN_USER_IDS
  ? `${process.env.ADMIN_USER_IDS},${ADMIN_ID}`
  : ADMIN_ID;

// eslint-disable-next-line @typescript-eslint/no-var-requires
import { AppModule } from '../src/app.module';
// eslint-disable-next-line @typescript-eslint/no-var-requires
import { PrismaService } from '../src/shared/prisma/prisma.service';

function isEnvReady(): boolean {
  return !!(process.env.DATABASE_URL && process.env.JWT_ACCESS_SECRET);
}

describe('SC-001~006: 목록 API 쿼리 DTO 검증 (limit 비정수/경계값/유효값)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let sellerToken: string;
  let seededSellerId: string | undefined;

  beforeAll(async () => {
    if (!isEnvReady()) return;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // main.ts 와 동일한 전역 ValidationPipe 구성 (auth.e2e-spec.ts 등 기존 컨벤션 재사용) —
    // TestingModule.createNestApplication() 은 main.ts bootstrap() 을 거치지 않으므로
    // 명시적으로 등록해야 신규 ListQueryDto/AdminSellerListQueryDto 검증이 동작한다.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    prisma = moduleFixture.get<PrismaService>(PrismaService);

    const jwt = new JwtService({ secret: process.env.JWT_ACCESS_SECRET });
    adminToken = jwt.sign({ sub: ADMIN_ID, email: 'admin-list-query@e2e.test' });
    sellerToken = jwt.sign({ sub: SELLER_USER_ID, email: 'seller-list-query@e2e.test' });

    await prisma.user.upsert({
      where: { id: SELLER_USER_ID },
      create: { id: SELLER_USER_ID, email: 'seller-list-query@e2e.test' },
      update: {},
    });
    const seller = await prisma.seller.upsert({
      where: { userId: SELLER_USER_ID },
      create: {
        userId: SELLER_USER_ID,
        businessName: '019 목록 쿼리 검증 판매자',
        businessNumber: '000-00-00001',
        representativeName: '검증용',
        status: 'APPROVED',
      },
      update: { status: 'APPROVED' },
    });
    seededSellerId = seller.id;
  });

  afterAll(async () => {
    if (!app || !prisma) return;
    if (seededSellerId) {
      await prisma.seller.deleteMany({ where: { id: seededSellerId } });
    }
    await prisma.user.deleteMany({ where: { id: SELLER_USER_ID } });
    await app.close();
  });

  function skipIfEnvNotReady(): boolean {
    if (!isEnvReady() || !app) {
      console.warn(
        'SC-001~006 SKIP: DATABASE_URL/JWT_ACCESS_SECRET 미설정.\n' +
          '통합 테스트 환경을 구성하고 재실행하세요:\n' +
          '  docker compose up -d && pnpm --filter backend exec prisma migrate dev\n' +
          '  DATABASE_URL=... JWT_ACCESS_SECRET=... pnpm --filter backend test:e2e -- list-query-dto',
      );
      return true;
    }
    return false;
  }

  // ── SC-001: admin/sellers/pending 비정수 limit → 400 ────────────────────
  describe('SC-001 (FR-001): GET /admin/sellers/pending?limit=abc → 400', () => {
    it('test_SC001_admin_sellers_pending_non_integer_limit_returns_400', async () => {
      if (skipIfEnvNotReady()) return;
      const res = await request(app.getHttpServer())
        .get('/admin/sellers/pending?limit=abc')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(400);
    });
  });

  // ── SC-002: admin/users 비정수 limit → 400 ─────────────────────────────
  describe('SC-002 (FR-002): GET /admin/users?limit=abc → 400', () => {
    it('test_SC002_admin_users_non_integer_limit_returns_400', async () => {
      if (skipIfEnvNotReady()) return;
      const res = await request(app.getHttpServer())
        .get('/admin/users?limit=abc')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(400);
    });
  });

  // ── SC-003: admin/audit-logs 비정수 limit → 400 ────────────────────────
  describe('SC-003 (FR-003): GET /admin/audit-logs?limit=abc → 400', () => {
    it('test_SC003_admin_audit_logs_non_integer_limit_returns_400', async () => {
      if (skipIfEnvNotReady()) return;
      const res = await request(app.getHttpServer())
        .get('/admin/audit-logs?limit=abc')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(400);
    });
  });

  // ── SC-004: sellers/me/products 비정수 limit → 400 ─────────────────────
  describe('SC-004 (FR-004): GET /sellers/me/products?limit=abc → 400', () => {
    it('test_SC004_sellers_me_products_non_integer_limit_returns_400', async () => {
      if (skipIfEnvNotReady()) return;
      const res = await request(app.getHttpServer())
        .get('/sellers/me/products?limit=abc')
        .set('Authorization', `Bearer ${sellerToken}`);
      expect(res.status).toBe(400);
    });
  });

  // ── SC-005: 4개 엔드포인트 limit=0/101 경계값 → 400 ─────────────────────
  describe('SC-005 (FR-005): limit=0·limit=101 경계값 → 400 (4개 엔드포인트)', () => {
    const targets: Array<{ label: string; path: string; token: () => string }> = [
      { label: 'admin_sellers_pending', path: '/admin/sellers/pending', token: () => adminToken },
      { label: 'admin_users', path: '/admin/users', token: () => adminToken },
      { label: 'admin_audit_logs', path: '/admin/audit-logs', token: () => adminToken },
      { label: 'sellers_me_products', path: '/sellers/me/products', token: () => sellerToken },
    ];

    it.each(targets)('test_SC005_$label_limit_0_returns_400', async ({ path, token }) => {
      if (skipIfEnvNotReady()) return;
      const res = await request(app.getHttpServer())
        .get(`${path}?limit=0`)
        .set('Authorization', `Bearer ${token()}`);
      expect(res.status).toBe(400);
    });

    it.each(targets)('test_SC005_$label_limit_101_returns_400', async ({ path, token }) => {
      if (skipIfEnvNotReady()) return;
      const res = await request(app.getHttpServer())
        .get(`${path}?limit=101`)
        .set('Authorization', `Bearer ${token()}`);
      expect(res.status).toBe(400);
    });
  });

  // ── SC-006: 4개 엔드포인트 유효 limit=20 → 200 + 기존 구조 유지(NFR-001) ─
  describe('SC-006 (NFR-001): 유효 limit=20 → 200 + 기존 응답 구조 유지(회귀 없음)', () => {
    it('test_SC006_admin_sellers_pending_valid_limit_returns_200_with_envelope', async () => {
      if (skipIfEnvNotReady()) return;
      const res = await request(app.getHttpServer())
        .get('/admin/sellers/pending?limit=20')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('items');
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body).toHaveProperty('nextCursor');
    });

    it('test_SC006_admin_sellers_pending_with_status_and_q_returns_200(ADR-002 회귀 방어)', async () => {
      /**
       * ADR-002: `AdminSellerListQueryDto.status`/`q` 는 `@IsEnum` 이 아닌
       * `@IsString @IsOptional`(자유 문자열)이므로, status·q 동반 요청도
       * 400 이 아닌 200 이어야 한다(forbidNonWhitelisted 회귀 방지 — 4필드 전부 DTO 선언 필수).
       */
      if (skipIfEnvNotReady()) return;
      const res = await request(app.getHttpServer())
        .get('/admin/sellers/pending?limit=20&status=APPROVED&q=%EB%A7%88%EC%BC%93')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('items');
    });

    it('test_SC006_admin_users_valid_limit_returns_200_with_envelope', async () => {
      if (skipIfEnvNotReady()) return;
      const res = await request(app.getHttpServer())
        .get('/admin/users?limit=20')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('items');
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body).toHaveProperty('nextCursor');
    });

    it('test_SC006_admin_audit_logs_valid_limit_returns_200_with_array', async () => {
      if (skipIfEnvNotReady()) return;
      const res = await request(app.getHttpServer())
        .get('/admin/audit-logs?limit=20')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('test_SC006_sellers_me_products_valid_limit_returns_200_with_envelope', async () => {
      if (skipIfEnvNotReady()) return;
      const res = await request(app.getHttpServer())
        .get('/sellers/me/products?limit=20')
        .set('Authorization', `Bearer ${sellerToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('items');
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body).toHaveProperty('nextCursor');
    });
  });
});
