/**
 * auth.util 단위 테스트 — [env:unit]
 *
 * 대상 SC: SC-024 (FR-016, NFR-004 관련)
 * 검증 방법: Jest — maskEmail 순수 함수 직접 호출
 *
 * SC-024: 이메일 찾기 결과 이메일이 앞 2자 공개 + @ 앞 나머지 마스킹(**) + @ + 도메인
 *   형태로 표시된다.
 *
 * NFR-004: 앞 2자를 제외한 @ 앞 부분을 마스킹(**) 처리, 도메인 부분 그대로.
 * plan §A-3: maskEmail('johndoe@example.com') → 'jo**@example.com'
 *             maskEmail('ab@x.com') → 'ab**@x.com'
 *             maskEmail('a@x.com')  → 'a**@x.com'
 *
 * [§F 확장, v1.1.0/018 spec — T018] maskPhone(SC-016 보조, NFR-009) 신규 추가.
 * `01012345678` → `*******5678`, 짧은 값(<4자)은 전체 마스킹. 기존 maskEmail 테스트 불변.
 */

import { maskEmail, maskPhone } from './auth.util';

describe('maskEmail (SC-024 — FR-016, NFR-004)', () => {
  // ─────────────────────────────────────────────
  // Happy Path: local ≥ 3자 (일반 케이스)
  // ─────────────────────────────────────────────
  describe('test_mask_email_format — local 3자 이상', () => {
    it('when_local_longer_than_2_then_first2_plus_mask_at_domain', () => {
      /**
       * SC-024 Happy Path:
       * local 파트가 3자 이상인 경우 앞 2자 + '**' + '@' + 도메인 형태 반환.
       * 예: 'johndoe@example.com' → 'jo**@example.com'
       */
      expect(maskEmail('johndoe@example.com')).toBe('jo**@example.com');
    });

    it('when_local_exactly_3_then_first2_plus_mask', () => {
      /**
       * SC-024 Happy Path (local=3):
       * 'abc@x.com' → 'ab**@x.com'
       */
      expect(maskEmail('abc@x.com')).toBe('ab**@x.com');
    });
  });

  // ─────────────────────────────────────────────
  // Edge Case: local ≤ 2자 경계
  // ─────────────────────────────────────────────
  describe('test_mask_email_short_local — local ≤ 2자 경계', () => {
    it('when_local_exactly_2_then_keep2_plus_mask', () => {
      /**
       * SC-024 Edge Case (local=2):
       * plan §A-3: 'ab@x.com' → 'ab**@x.com'
       * keep = local.slice(0, min(2, 2)) = 'ab' → 'ab**@x.com'
       */
      expect(maskEmail('ab@x.com')).toBe('ab**@x.com');
    });

    it('when_local_exactly_1_then_keep1_plus_mask', () => {
      /**
       * SC-024 Edge Case (local=1):
       * plan §A-3: 'a@x.com' → 'a**@x.com'
       * keep = local.slice(0, min(2, 1)) = 'a' → 'a**@x.com'
       */
      expect(maskEmail('a@x.com')).toBe('a**@x.com');
    });
  });

  // ─────────────────────────────────────────────
  // Edge Case: 도메인 다양성
  // ─────────────────────────────────────────────
  describe('domain 다양성 — 도메인 부분 그대로 표시', () => {
    it('when_domain_has_multiple_dots_then_domain_preserved', () => {
      /**
       * SC-024 보조: 도메인 부분은 변환 없이 그대로.
       * 'johndoe@mail.example.co.kr' → 'jo**@mail.example.co.kr'
       */
      expect(maskEmail('johndoe@mail.example.co.kr')).toBe('jo**@mail.example.co.kr');
    });
  });
});

// ─────────────────────────────────────────────
// maskPhone — SC-016 보조 (NFR-009 관련) (v1.1.0/018 spec, T018)
// ─────────────────────────────────────────────
describe('maskPhone (SC-016 보조 — NFR-009) (v1.1.0/018 spec)', () => {
  // ─────────────────────────────────────────────
  // Happy Path: 표준 11자리 전화번호
  // ─────────────────────────────────────────────
  describe('test_mask_phone_format — 표준 11자리 (구분자 없음)', () => {
    it('when_phone_11_digits_then_last4_exposed_rest_masked', () => {
      /**
       * SC-016 보조 (NFR-009) (v1.1.0/018 spec):
       * 뒤 4자리만 노출, 나머지 * 로 치환.
       * '01012345678' → '*******5678' (7개 * + 뒤 4자리).
       */
      expect(maskPhone('01012345678')).toBe('*******5678');
    });
  });

  // ─────────────────────────────────────────────
  // Edge Case: 길이 < 4 (전체 마스킹)
  // ─────────────────────────────────────────────
  describe('test_mask_phone_short — 길이 4 미만 전체 마스킹', () => {
    it('when_phone_shorter_than_4_then_fully_masked', () => {
      /**
       * SC-016 보조 (NFR-009) (v1.1.0/018 spec):
       * 길이 < 4 는 전체 마스킹. '123' → '***' (길이 동일 유지).
       */
      expect(maskPhone('123')).toBe('***');
    });

    it('when_phone_empty_then_empty_string', () => {
      /** Edge: 빈 문자열은 빈 문자열 반환(길이 0 마스킹). */
      expect(maskPhone('')).toBe('');
    });
  });

  // ─────────────────────────────────────────────
  // Edge Case: 경계값 (길이 == 4)
  // ─────────────────────────────────────────────
  describe('test_mask_phone_boundary — 길이 정확히 4', () => {
    it('when_phone_exactly_4_then_no_mask_prefix', () => {
      /**
       * SC-016 보조 (NFR-009) (v1.1.0/018 spec):
       * 길이 == 4 인 경우 마스킹 접두 0개 + 뒤 4자리 그대로.
       * '5678' → '5678' ('*'.repeat(0) + '5678').
       */
      expect(maskPhone('5678')).toBe('5678');
    });
  });

  // ─────────────────────────────────────────────
  // Edge Case: 구분자 포함 (dash 포함 형식)
  // ─────────────────────────────────────────────
  describe('test_mask_phone_with_separators — 구분자(dash) 포함 형식', () => {
    it('when_phone_has_dashes_then_masks_by_raw_length', () => {
      /**
       * SC-016 보조 (NFR-009) (v1.1.0/018 spec):
       * maskPhone 은 구분자를 별도 제거하지 않고 원본 문자열 길이 기준으로 마스킹한다
       * (production: phone.length 기준 slice — 구분자 포함 시 구분자도 마스킹 대상에 포함).
       * '010-1234-5678'(13자) → 뒤 4자리 '5678' + 앞 9자 '*'.
       */
      const input = '010-1234-5678';
      expect(maskPhone(input)).toBe('*********5678');
    });
  });
});
