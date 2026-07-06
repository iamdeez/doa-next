import { registerAs } from '@nestjs/config';

/**
 * 이니시스 결제 게이트웨이 환경변수 매핑 (FR-005).
 *
 * jwtConfig 와 달리 이 config 팩토리 자체는 필수값을 검증하지 않는다 — 필수 env 검증은
 * PAYMENT_PROVIDER=inicis 선택 시점(IniisisPaymentGateway 생성자)에서만 수행하여
 * PAYMENT_PROVIDER=stub(또는 미설정) 부팅을 방해하지 않는다(research.md §1-1, ASM-013).
 *
 * [TO-VERIFY] 정확한 이니시스 개발자센터 키 요구사항(발급 위치·apiKey/apiIv 필수 여부)은
 * 공식 문서로 확정 필요(research.md §4-3, GAP-021-02).
 */
export interface InicisConfig {
  mid?: string;
  signKey?: string;
  apiBaseUrl?: string;
  apiKey?: string;
  apiIv?: string;
}

export const inicisConfig = registerAs(
  'inicis',
  (): InicisConfig => ({
    mid: process.env['INICIS_MID'],
    signKey: process.env['INICIS_SIGN_KEY'],
    apiBaseUrl: process.env['INICIS_API_BASE_URL'],
    apiKey: process.env['INICIS_API_KEY'],
    apiIv: process.env['INICIS_API_IV'],
  }),
);
