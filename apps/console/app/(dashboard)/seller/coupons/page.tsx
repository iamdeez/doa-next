'use client';

import { EmptyState } from '@doa/ui';
import { CouponManager } from '@/components/coupon-manager';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/** 판매자 쿠폰 — 생성·발급. */
export default function SellerCouponsPage() {
  const { isSeller } = useAuth();
  if (!isSeller) {
    return <EmptyState title="판매자 미등록" message="판매자 등록 후 쿠폰을 발급할 수 있습니다." />;
  }
  return (
    <CouponManager
      api={{
        list: () => api.coupon.listSeller(),
        create: (body) => api.coupon.createSeller(body),
        issue: (id, body) => api.coupon.issueSeller(id, body),
      }}
      queryScope="seller"
      title="쿠폰"
      subtitle="할인 쿠폰을 생성하고 고객에게 발급합니다."
    />
  );
}
