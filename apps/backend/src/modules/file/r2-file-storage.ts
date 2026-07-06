import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { FileStoragePort, PresignedUpload } from './file-storage.port';
import { R2Config } from './r2.config';

/** presigned PUT URL 만료 시간(초) — ADR-006, 사용자 승인 */
export const R2_PRESIGN_EXPIRES_SECONDS = 600;

/**
 * Cloudflare R2 실연동 (FR-007·FR-008) — P-002 L32 명시 허용(`@aws-sdk/client-s3`,
 * R2 는 S3 호환 엔드포인트). allowlist(4종)·10MiB 상한 검증은 FileService 계층에 이미
 * 존재하므로 여기서 중복 검증하지 않는다(FR-009 회귀 방지 — research.md §5-2).
 */
@Injectable()
export class R2FileStorage implements FileStoragePort {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;

  constructor(configService: ConfigService) {
    const raw = configService.get<R2Config>('r2') ?? {};
    if (
      !raw.accountId ||
      !raw.accessKeyId ||
      !raw.secretAccessKey ||
      !raw.bucket ||
      !raw.publicBaseUrl
    ) {
      throw new Error(
        'R2FileStorage requires R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE_URL (FILE_STORAGE=r2)',
      );
    }

    this.bucket = raw.bucket;
    this.publicBaseUrl = raw.publicBaseUrl;
    // S3Client 는 stateless·thread-safe — 생성자에서 1회 생성 후 재사용(research.md §1-3)
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${raw.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: raw.accessKeyId,
        secretAccessKey: raw.secretAccessKey,
      },
    });
  }

  async getPresignedUploadUrl(key: string, contentType: string): Promise<PresignedUpload> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: R2_PRESIGN_EXPIRES_SECONDS,
    });

    return { uploadUrl, publicUrl: this.getPublicUrl(key) };
  }

  getPublicUrl(key: string): string {
    return `${this.publicBaseUrl}/${key}`;
  }
}
