'use client';

import { CouponManager } from '@/components/coupon-manager';
import { api } from '@/lib/api';

/** 관리자 쿠폰 — 생성·발급(전역). */
export default function AdminCouponsPage() {
  return (
    <CouponManager
      api={{
        list: () => api.admin.listCoupons(),
        create: (body) => api.admin.createCoupon(body),
        issue: (id, body) => api.admin.issueCoupon(id, body),
      }}
      queryScope="admin"
      title="쿠폰(관리자)"
      subtitle="플랫폼 전역 할인 쿠폰을 생성하고 발급합니다."
    />
  );
}
