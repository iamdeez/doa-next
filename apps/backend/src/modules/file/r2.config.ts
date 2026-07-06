import { registerAs } from '@nestjs/config';

/**
 * Cloudflare R2 환경변수 매핑 (FR-007·FR-008).
 *
 * 필수값 검증은 FILE_STORAGE=r2 선택 시점(R2FileStorage 생성자)에서만 수행하여
 * FILE_STORAGE=stub(또는 미설정) 부팅을 방해하지 않는다(research.md §1-1, ASM-013).
 */
export interface R2Config {
  accountId?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  bucket?: string;
  publicBaseUrl?: string;
}

export const r2Config = registerAs(
  'r2',
  (): R2Config => ({
    accountId: process.env['R2_ACCOUNT_ID'],
    accessKeyId: process.env['R2_ACCESS_KEY_ID'],
    secretAccessKey: process.env['R2_SECRET_ACCESS_KEY'],
    bucket: process.env['R2_BUCKET'],
    publicBaseUrl: process.env['R2_PUBLIC_BASE_URL'],
  }),
);
