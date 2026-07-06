/**
 * Test: OAuthStateService — state(CSRF) 발급·검증 (SC-001, SC-002, SC-010, v1.1.0/016 spec)
 *
 * TDD Red 상태: `OAuthStateService` 가 아직 생성되지 않았다(T004 Development 병렬
 * 진행, PPG-1). 아래 시그니처는 tasks.md "Test Authoring Contract" canonical 을
 * 기준으로 작성했으며, production 미구현 상태에서의 컴파일/실행 오류는 허용한다
 * (계약 검증). production 구현 완료 후 이 파일이 PASS 상태로 전환된다.
 *
 * TTL·소비 원자성은 AuthRepository(→ Prisma `deleteMany`)에 위임되므로(tasks.md
 * T003), 이 서비스 계층 테스트는 repo 위임 결과(count)에 대한 서비스의 판단
 * 로직(count===1 → true)만 격리 검증한다.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { OAuthStateService } from './oauth-state.service';
import { AuthRepository } from '../auth.repository';

// ─── Mock factories ──────────────────────────────────────────────────────────

const makeMockAuthRepository = () => ({
  createOAuthState: jest.fn().mockResolvedValue(undefined),
  consumeOAuthState: jest.fn(),
  deleteExpiredOAuthStates: jest.fn().mockResolvedValue(0),
});

/** base64url(패딩 없음) 형식 — `/`·`+`·`=` 미포함. */
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('OAuthStateService — state(CSRF) 발급·검증 (v1.1.0/016)', () => {
  let service: OAuthStateService;
  let mockRepo: ReturnType<typeof makeMockAuthRepository>;

  beforeEach(async () => {
    mockRepo = makeMockAuthRepository();

    const module: TestingModule = await Test.createTestingModule({
      providers: [OAuthStateService, { provide: AuthRepository, useValue: mockRepo }],
    }).compile();

    service = module.get<OAuthStateService>(OAuthStateService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── SC-001 (FR-001): issue → 유효 state 반환 ─────────────────────────────
  it('test_SC001_issue_returns_state', async () => {
    const result = await service.issue('naver');

    expect(result.state).toBeTruthy();
    expect(typeof result.state).toBe('string');
    expect(result.state).toMatch(BASE64URL_PATTERN);
    expect(mockRepo.createOAuthState).toHaveBeenCalledTimes(1);

    const [callArg] = mockRepo.createOAuthState.mock.calls[0] as [
      { state: string; provider: string; expiresAt: Date },
    ];
    expect(callArg.state).toBe(result.state);
    expect(callArg.provider).toBe('naver');
    expect(callArg.expiresAt).toBeInstanceOf(Date);
    expect(callArg.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  // ── SC-002 (FR-002): TTL 경과 후 consume 거부 ────────────────────────────
  it('test_SC002_expired_state_consume_false', async () => {
    // repo.consumeOAuthState 는 WHERE expiresAt > now 조건을 포함하는 원자적
    // deleteMany 이므로, 만료된 state 는 매칭 행 0건(count=0)을 반환한다.
    mockRepo.consumeOAuthState.mockResolvedValue(0);

    const result = await service.consume('naver', 'expired-state-value');

    expect(result).toBe(false);
    expect(mockRepo.consumeOAuthState).toHaveBeenCalledWith(
      'naver',
      'expired-state-value',
      expect.any(Date),
    );
  });

  // ── SC-010 (NFR-002): 연속 발급 예측불가(중복 0) ─────────────────────────
  it('test_SC010_issue_distinct_values', async () => {
    const ISSUE_COUNT = 20;
    const states = new Set<string>();

    for (let i = 0; i < ISSUE_COUNT; i++) {
      const { state } = await service.issue('naver');
      states.add(state);
    }

    expect(states.size).toBe(ISSUE_COUNT);
  });
});
