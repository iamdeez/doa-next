import { IsOptional, IsString } from 'class-validator';
import { ListQueryDto } from '../../../shared/dto/list-query.dto';

/**
 * `GET /admin/sellers/pending` Query DTO (FR-001, ADR-002).
 * `status`·`q` 는 서비스 레이어가 문자열 파싱/기본값 처리를 담당하므로
 * `@IsEnum` 을 사용하지 않는다(P-007 — 범위 외 동작 변경 방지).
 */
export class AdminSellerListQueryDto extends ListQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  q?: string;
}
