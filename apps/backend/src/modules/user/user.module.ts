import { Module } from '@nestjs/common';
import { AuthSharedModule } from '../../shared/auth/auth-shared.module';
import { ProductModule } from '../product/product.module';
import { UserController } from './user.controller';
import { UserEventsHandler } from './user.events';
import { UserRepository } from './user.repository';
import { UserService } from './user.service';

// ProductModule: UserService.getPublicSummaries DI 소비 (017 — 위시리스트·최근 본 상품 요약).
// 순환 참조 없음 — ProductModule 은 UserModule 을 import 하지 않는다(research.md 실검증).
@Module({
  imports: [AuthSharedModule, ProductModule],
  controllers: [UserController],
  providers: [UserService, UserRepository, UserEventsHandler],
  exports: [UserService],
})
export class UserModule {}
