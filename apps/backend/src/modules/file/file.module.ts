import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthSharedModule } from '../../shared/auth/auth-shared.module';
import { FILE_STORAGE, FileStoragePort } from './file-storage.port';
import { FileController } from './file.controller';
import { FileRepository } from './file.repository';
import { FileService } from './file.service';
import { R2FileStorage } from './r2-file-storage';
import { r2Config } from './r2.config';
import { StubFileStorage } from './stub-file-storage';

/**
 * 파일 메타데이터 모듈 (006-file).
 * 객체 스토리지 연동은 FileStoragePort 추상화 — env(FILE_STORAGE)로 R2FileStorage/
 * StubFileStorage 를 선택(ADR-005). P-002 L32: `@aws-sdk/client-s3`(S3 호환) 명시 허용.
 * FileService 를 export — 타 도메인이 public URL 조회 등에 활용 가능.
 */
@Module({
  imports: [AuthSharedModule, ConfigModule.forFeature(r2Config)],
  controllers: [FileController],
  providers: [
    FileService,
    FileRepository,
    {
      provide: FILE_STORAGE,
      // ADR-005: FILE_STORAGE env 기반 선택. 미설정·미인식 값은 stub(default) —
      // 기존 e2e 가 override 없이 AppModule 을 부팅하므로 회귀 방지 필수.
      useFactory: (configService: ConfigService): FileStoragePort => {
        const provider = configService.get<string>('FILE_STORAGE');
        return provider === 'r2' ? new R2FileStorage(configService) : new StubFileStorage();
      },
      inject: [ConfigService],
    },
  ],
  exports: [FileService],
})
export class FileModule {}
