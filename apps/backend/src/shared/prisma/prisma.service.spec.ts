/**
 * PrismaService.tx delegate 복원 targeted unit — [env:unit]
 *
 * 대상 SC: SC-006·SC-017 회귀 방지 (v1.1.0/019 spec) — GAP-019-03(P0)/T016(ADR-006) fix
 * 검증 방법: 실 `PrismaService` 인스턴스(DB 연결 불요 — Proxy 동작만 검증, `$connect` 미호출).
 *
 * Test Authoring Contract canonical (tasks.md T016/T018):
 *   - `PrismaService.registerRootClient(client: PrismaClient): void` — 팩토리가 Proxy
 *     자기참조를 `rootClient` 필드에 저장.
 *   - `get tx(): TxClient` 반환 우선순위: `als.getStore()?.client`(tx 내부) ??
 *     `rootClient`(비-tx, delegate 보유 Proxy) ?? `(this as unknown as TxClient)`(미주입 fallback).
 *   - getter 시그니처·반환형·`runInTransaction`·`onAfterCommit`·lifecycle hook 전부 불변.
 */

import { PrismaService } from './prisma.service';

describe('PrismaService.tx', () => {
  // ─────────────────────────────────────────────
  // SC-006 (v1.1.0/019 spec): registerRootClient 등록 시 비-tx 경로에서 model delegate 복원
  // ─────────────────────────────────────────────
  describe('SC-006 (v1.1.0/019 spec): registerRootClient 등록 후 tx 가 model delegate 를 보유', () => {
    it('test_SC006_019_tx_returns_delegate_bearing_proxy_after_registerRootClient', () => {
      /**
       * SC-006 (v1.1.0/019 spec): `registerRootClient(client)` 로 자기참조(Proxy)를
       * 등록하면, 트랜잭션 외부(ALS store 없음)에서도 `tx` getter 가 model delegate
       * (`user`·`adminAuditLog` 등)를 보유한 객체를 반환해야 한다 — SC-006 e2e
       * (admin/audit-logs 200) 를 차단했던 GAP-019-03 근본원인의 회귀 방지.
       */
      const service = new PrismaService();
      service.registerRootClient(service);

      expect((service.tx as unknown as Record<string, unknown>)['user']).toBeDefined();
      expect(
        (service.tx as unknown as Record<string, unknown>)['adminAuditLog'],
      ).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────
  // SC-017 (v1.1.0/019 spec): registerRootClient 미주입 시 하위호환 fallback 유지 (회귀 0)
  // ─────────────────────────────────────────────
  describe('SC-017 (v1.1.0/019 spec): registerRootClient 미주입 인스턴스는 fallback 하위호환 유지', () => {
    it('test_SC017_019_tx_falls_back_to_self_cast_when_rootClient_unregistered', () => {
      /**
       * SC-017 (v1.1.0/019 spec): `registerRootClient` 를 호출하지 않은 인스턴스에서도
       * `tx` getter 는 기존 fallback 분기(`this as unknown as TxClient`)로 truthy 값을
       * 반환해야 한다 — T016 fix 가 fallback 경로를 깨뜨리지 않음을 확인(회귀 0 방어).
       * (참고: fallback 은 getter 실행 컨텍스트의 raw `this` 를 반환하며, 이는 Proxy
       * 자기참조와 참조 동일성이 없음이 GAP-019-03 의 근본원인이었다 — 따라서 여기서는
       * 참조 동일성이 아닌 truthy 여부만 단언한다.)
       */
      const service = new PrismaService();

      expect(service.tx).toBeTruthy();
    });
  });

  // ─────────────────────────────────────────────
  // SC-017 보조 (v1.1.0/019 spec): 트랜잭션 내부에서는 ALS store.client 우선 반환 (경로 불변)
  // ─────────────────────────────────────────────
  describe('SC-017 (v1.1.0/019 spec) 보조: 트랜잭션 내부에서 tx 는 ALS store.client 반환', () => {
    it('test_SC017_019_tx_returns_als_store_client_inside_transaction', async () => {
      /**
       * SC-017 (v1.1.0/019 spec): `runInTransaction` 내부(ALS store 존재)에서는
       * `tx` 가 `rootClient`/fallback 이 아닌 `store.client`(인터랙티브 트랜잭션
       * 클라이언트)를 우선 반환해야 한다 — T016 fix 가 트랜잭션 경로를 불변으로
       * 유지함을 spy 로 확인.
       */
      const service = new PrismaService();
      service.registerRootClient(service);

      const fakeTxClient = { user: { findMany: jest.fn() } };
      jest
        .spyOn(
          service as unknown as { $transaction: (fn: (client: unknown) => unknown) => unknown },
          '$transaction',
        )
        .mockImplementation((fn: (client: unknown) => unknown) => fn(fakeTxClient));

      let observedTx: unknown;
      await service.runInTransaction(async () => {
        observedTx = service.tx;
      });

      expect(observedTx).toBe(fakeTxClient);
    });
  });
});
