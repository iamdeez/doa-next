import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

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
