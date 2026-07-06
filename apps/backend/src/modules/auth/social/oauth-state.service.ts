import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AuthRepository } from '../auth.repository';
import { NAVER_STATE_TTL_MIN } from '../auth.constants';

/**
 * 네이버 code-exchange CSRF state(nonce) 발급·소비 서비스(SEC-015-02 하드닝).
 * 발급값은 서버 자체 DB(oauth_states)에 보관되며, 검증은 원자적 조건부 DELETE로
 * "확인+소비"를 단일 문(statement)으로 처리한다(delete-on-consume, 1회성).
 */
@Injectable()
export class OAuthStateService {
  constructor(private readonly repo: AuthRepository) {}

  async issue(provider: string): Promise<{ state: string }> {
    // 256bit CSPRNG(예측 불가) — globalThis.crypto/crypto.subtle 은 Secure Context 제약(HTTP+
    // 비localhost 환경에서 실패)이 있어 회피하고 서버 native node:crypto 를 사용한다.
    const state = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + NAVER_STATE_TTL_MIN * 60_000);

    // opportunistic 만료 정리 — 익명 발급 flood로 인한 테이블 무한 증식 방지.
    await this.repo.deleteExpiredOAuthStates(new Date());
    await this.repo.createOAuthState({ state, provider, expiresAt });

    return { state };
  }

  async consume(provider: string, state?: string): Promise<boolean> {
    if (!state) return false; // state 미제공 — DB 조회 없이 즉시 거부(불필요 쿼리 절감)
    const deletedCount = await this.repo.consumeOAuthState(provider, state, new Date());
    return deletedCount === 1;
  }
}
