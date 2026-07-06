import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });

  // Fly.io 엣지 프록시 첫 홉만 신뢰(FR-004/NFR-008/ADR-004) — trust proxy 미설정 시
  // req.ip 가 프록시 연결 IP 단일 버킷으로 집계되어 rate limit 이 운영에서 무력화된다.
  app.set('trust proxy', 1);

  // structured stdout logging via nestjs-pino
  app.useLogger(app.get(Logger));

  // CORS — 콘솔(별도 origin)·로컬 데모 클라이언트 허용.
  // CORS_ORIGIN(콤마구분) 미설정 시 전체 허용(로컬/개발). 운영은 환경변수로 화이트리스트.
  app.enableCors({
    origin: process.env['CORS_ORIGIN']?.split(',') ?? true,
    credentials: true,
  });

  // global DTO validation (whitelist: strip unknown props, forbidNonWhitelisted: reject unknown)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env['PORT'] ?? 3000;
  await app.listen(port);
}

bootstrap().catch((err: unknown) => {
  console.error('Failed to start application', err);
  process.exit(1);
});
