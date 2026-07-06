import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length, Matches } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: '123456', description: '6자리 숫자 OTP' })
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  otp!: string;

  @ApiProperty({ example: 'NewPass123!', description: '8자 이상 새 비밀번호' })
  @IsString()
  @Length(8, 100)
  newPassword!: string;
}
