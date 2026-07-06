import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class FindEmailDto {
  @ApiProperty({ example: '01012345678', description: '하이픈 없는 휴대폰 번호' })
  @IsString()
  @Matches(/^01[0-9]{8,9}$/)
  phone!: string;
}
