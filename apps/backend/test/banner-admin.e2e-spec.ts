/**
 * 007 banner 공개 노출 + admin 권한 통합 테스트 — [env:integration]
 *
 * 검증:
 *   - GET /banners 공개 접근(인증 불필요) + 활성/노출기간 배너 노출
 *   - /admin/* 엔드포인트 인증·관리자 권한(AdminGuard, fail-closed)
 *   - AppModule 부팅 시 BannerModule·StatsModule·AdminModule DI 등록 (앱 기동 성공이 곧 등록 증거)
 *
 * 실행 전제: PostgreSQL 기동 + .env(DATABASE_URL, JWT_ACCESS_SECRET) 설정 + 007 마이그레이션 적용.
 * ADMIN_USER_IDS 는 본 테스트가 부팅 전 process.env 로 주입(@nestjs/config dotenv 는 기존 값 미덮어씀).
 */

import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';

// 관리자/일반 사용자 식별자 (DB 사용자 행 불필요 — JwtStrategy/AdminGuard 는 페이로드만 검사)
const ADMIN_ID = 'e2e-admin-007';
const USER_ID = 'e2e-user-007';

// AppModule import·부팅 전에 ADMIN_USER_IDS 주입 (dotenv override:false → 유지)
process.env.ADMIN_USER_IDS = ADMIN_ID;

// AppModule 은 위 환경 설정 이후 import 한다.
// eslint-disable-next-line @typescript-eslint/no-var-requires
import { AppModule } from '../src/app.module';

function isEnvReady(): boolean {
  return !!(process.env.DATABASE_URL && process.env.JWT_ACCESS_SECRET);
}

describe('007 banner/admin (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let userToken: string;
  const createdBannerIds: string[] = [];

  beforeAll(async () => {
    if (!isEnvReady()) return;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    const jwt = new JwtService({ secret: process.env.JWT_ACCESS_SECRET });
    adminToken = jwt.sign({ sub: ADMIN_ID, email: 'admin@e2e.test' });
    userToken = jwt.sign({ sub: USER_ID, email: 'user@e2e.test' });
  });

  afterAll(async () => {
    if (!app) return;
    // 생성한 배너 정리 (관리자 토큰)
    for (const id of createdBannerIds) {
      await request(app.getHttpServer())
        .delete(`/admin/banners/${id}`)
        .set('Authorization', `Bearer ${adminToken}`);
    }
    await app.close();
  });

  // ── 공개 노출 ──────────────────────────────────────────────────────

  it('when_get_banners_without_auth_then_200_array', async () => {
    if (!app) return;
    const res = await request(app.getHttpServer()).get('/banners');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // ── 관리자 권한 (AdminGuard fail-closed) ────────────────────────────

  it('when_admin_banners_without_token_then_401', async () => {
    if (!app) return;
    const res = await request(app.getHttpServer()).get('/admin/banners');
    expect(res.status).toBe(401);
  });

  it('when_admin_banners_with_non_admin_token_then_403', async () => {
    if (!app) return;
    const res = await request(app.getHttpServer())
      .get('/admin/banners')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });

  it('when_admin_creates_active_banner_then_visible_in_public_list', async () => {
    if (!app) return;

    const createRes = await request(app.getHttpServer())
      .post('/admin/banners')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'E2E 노출 배너',
        imageUrl: 'https://img.example/e2e.png',
        position: 'MAIN_TOP',
        sortOrder: 5,
        isActive: true,
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.id).toBeDefined();
    createdBannerIds.push(createRes.body.id);

    const publicRes = await request(app.getHttpServer()).get('/banners');
    expect(publicRes.status).toBe(200);
    const ids = publicRes.body.map((b: { id: string }) => b.id);
    expect(ids).toContain(createRes.body.id);
  });

  it('when_admin_creates_future_banner_then_hidden_in_public_list', async () => {
    if (!app) return;

    const createRes = await request(app.getHttpServer())
      .post('/admin/banners')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'E2E 미래 배너',
        imageUrl: 'https://img.example/future.png',
        isActive: true,
        startsAt: '2999-01-01T00:00:00.000Z',
      });
    expect(createRes.status).toBe(201);
    createdBannerIds.push(createRes.body.id);

    const publicRes = await request(app.getHttpServer()).get('/banners');
    const ids = publicRes.body.map((b: { id: string }) => b.id);
    expect(ids).not.toContain(createRes.body.id);
  });

  // ── 관리자 통계/조회 (모듈 DI 등록 검증) ─────────────────────────────

  it('when_admin_gets_stats_overview_then_200_with_metrics', async () => {
    if (!app) return;
    const res = await request(app.getHttpServer())
      .get('/admin/stats/overview')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalOrders');
    expect(res.body).toHaveProperty('totalSales');
    expect(res.body).toHaveProperty('totalUsers');
    expect(res.body).toHaveProperty('totalSellers');
  });

  it('when_non_admin_gets_stats_overview_then_403', async () => {
    if (!app) return;
    const res = await request(app.getHttpServer())
      .get('/admin/stats/overview')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });

  it('when_admin_lists_pending_sellers_then_200_envelope(SC-011)', async () => {
    /**
     * SC-011 (FR-007 관련, v1.1.0/017 spec) §F 마이그레이션:
     * GET /admin/sellers/pending 응답이 기존 원시 배열에서 {items, nextCursor} envelope 으로
     * 변경됨(breaking change, research.md §F — 회귀 FAIL 확정 항목). 배열 직접 단언을 제거하고
     * envelope 필드 존재 + items 배열 여부로 정정한다.
     */
    if (!app) return;
    const res = await request(app.getHttpServer())
      .get('/admin/sellers/pending')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('items');
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body).toHaveProperty('nextCursor');
  });
});
