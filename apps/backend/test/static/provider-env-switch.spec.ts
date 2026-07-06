/**
 * 정적 코드 검증 — SC-008 (v1.1.0/021 spec) [env:static]
 *
 * 대상 SC: SC-008 (FR-005 관련)
 * 검증 방법: Node.js fs + payment.module.ts/file.module.ts/inicis.config.ts/r2.config.ts
 *   텍스트 파싱(실행/DI 컨테이너 부팅 없음)
 *
 * 검증 내용 (ADR-005 — env 전환만으로 sandbox↔운영·stub↔real 교체):
 *   1. PAYMENT_GATEWAY/FILE_STORAGE provider 가 `useFactory` 로 등록되어 있다
 *      (`useClass` 고정 바인딩이 아님 — 코드 변경 없이 값 전환 가능한 구조).
 *   2. 팩토리가 env 값(`PAYMENT_PROVIDER`/`FILE_STORAGE`)을 참조하여 분기한다.
 *   3. 미설정·미인식 값일 때 StubPaymentGateway/StubFileStorage(default) 로 안전
 *      fallback 한다(e2e/부팅 회귀 방지 — ASM-013, research.md §1-2).
 *   4. 이니시스/R2 config(`registerAs`)는 jwtConfig 와 달리 **무조건 throw 하지 않는다**
 *      (provider 미선택 시 stub 부팅을 막지 않아야 함 — research.md §1-1).
 *
 * 실행: 앱 기동·네트워크 호출 불필요. 파일 텍스트 검증만.
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC_ROOT = path.resolve(__dirname, '../../src');
const PAYMENT_MODULE_PATH = path.join(SRC_ROOT, 'modules/payment/payment.module.ts');
const FILE_MODULE_PATH = path.join(SRC_ROOT, 'modules/file/file.module.ts');
const INICIS_CONFIG_PATH = path.join(SRC_ROOT, 'modules/payment/inicis.config.ts');
const R2_CONFIG_PATH = path.join(SRC_ROOT, 'modules/file/r2.config.ts');

function readIfExists(filePath: string): string | null {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : null;
}

describe('SC-008 (021): env 전환만으로 sandbox↔운영·stub↔real 교체 (정적 검증)', () => {
  describe('PAYMENT_GATEWAY — payment.module.ts', () => {
    it('when_inspect_payment_module_then_uses_useFactory_not_fixed_useClass', () => {
      const source = readIfExists(PAYMENT_MODULE_PATH);
      expect(source).not.toBeNull();

      expect(source as string).toMatch(/useFactory\s*:/);
      // 고정 useClass 바인딩(useClass: StubPaymentGateway 단독)이 남아있지 않아야 함
      expect(source as string).not.toMatch(/useClass\s*:\s*StubPaymentGateway/);
    });

    it('when_inspect_payment_module_then_branches_on_PAYMENT_PROVIDER_env', () => {
      const source = readIfExists(PAYMENT_MODULE_PATH) as string;
      expect(source).toMatch(/PAYMENT_PROVIDER/);
      expect(source).toMatch(/inicis/);
    });

    it('when_inspect_payment_module_then_default_fallback_is_stub', () => {
      const source = readIfExists(PAYMENT_MODULE_PATH) as string;
      // 팩토리 함수 내에 StubPaymentGateway 참조가 fallback(default)로 존재해야 함
      expect(source).toMatch(/StubPaymentGateway/);
      expect(source).toMatch(/IniisisPaymentGateway/);
    });
  });

  describe('FILE_STORAGE — file.module.ts', () => {
    it('when_inspect_file_module_then_uses_useFactory_not_fixed_useClass', () => {
      const source = readIfExists(FILE_MODULE_PATH);
      expect(source).not.toBeNull();

      expect(source as string).toMatch(/useFactory\s*:/);
      expect(source as string).not.toMatch(/useClass\s*:\s*StubFileStorage/);
    });

    it('when_inspect_file_module_then_branches_on_FILE_STORAGE_env', () => {
      const source = readIfExists(FILE_MODULE_PATH) as string;
      expect(source).toMatch(/FILE_STORAGE/);
      expect(source).toMatch(/r2/);
    });

    it('when_inspect_file_module_then_default_fallback_is_stub', () => {
      const source = readIfExists(FILE_MODULE_PATH) as string;
      expect(source).toMatch(/StubFileStorage/);
      expect(source).toMatch(/R2FileStorage/);
    });
  });

  describe('config — 무조건 throw 금지(provider 미선택 시 stub 부팅 유지)', () => {
    it('when_inspect_inicis_config_then_registerAs_used_and_no_unconditional_throw', () => {
      const source = readIfExists(INICIS_CONFIG_PATH);
      expect(source).not.toBeNull();
      expect(source as string).toMatch(/registerAs\s*\(\s*['"]inicis['"]/);
      // jwtConfig 처럼 팩토리 콜백 내부에서 무조건 throw 하지 않아야 함(provider 선택 시점에만 검증)
      expect(source as string).not.toMatch(/throw new Error/);
    });

    it('when_inspect_r2_config_then_registerAs_used_and_no_unconditional_throw', () => {
      const source = readIfExists(R2_CONFIG_PATH);
      expect(source).not.toBeNull();
      expect(source as string).toMatch(/registerAs\s*\(\s*['"]r2['"]/);
      expect(source as string).not.toMatch(/throw new Error/);
    });
  });
});
