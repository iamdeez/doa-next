'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { ThemeToggle } from '@/components/theme-toggle';

interface NavItem {
  href: string;
  label: string;
  section: 'common' | 'seller' | 'admin';
}

const NAV: NavItem[] = [
  { href: '/dashboard', label: '대시보드', section: 'common' },
  { href: '/account/profile', label: '프로필', section: 'common' },
  { href: '/account/addresses', label: '배송지', section: 'common' },
  { href: '/account/wishlist', label: '위시리스트', section: 'common' },
  { href: '/account/notifications', label: '알림', section: 'common' },
  { href: '/seller/products', label: '내 상품', section: 'seller' },
  { href: '/seller/orders', label: '주문·배송', section: 'seller' },
  { href: '/seller/coupons', label: '쿠폰', section: 'seller' },
  { href: '/seller/settlements', label: '정산', section: 'seller' },
  { href: '/seller/stats', label: '판매 통계', section: 'seller' },
  { href: '/admin/sellers', label: '판매자 승인', section: 'admin' },
  { href: '/admin/coupons', label: '쿠폰(관리자)', section: 'admin' },
  { href: '/admin/banners', label: '배너', section: 'admin' },
  { href: '/admin/settlements', label: '전체 정산', section: 'admin' },
  { href: '/admin/stats', label: '플랫폼 통계', section: 'admin' },
  { href: '/admin/users', label: '사용자', section: 'admin' },
  { href: '/admin/audit-logs', label: '감사 로그', section: 'admin' },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { loading, isAuthenticated, isSeller, isAdmin, sellerStatus, profile, logout } = useAuth();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (!loading && !isAuthenticated) router.replace('/login');
  }, [loading, isAuthenticated, router]);

  // 라우트 이동 시 모바일 드로어를 닫는다(데스크톱은 lg: 에서 항상 보이므로 영향 없음).
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  if (loading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        불러오는 중…
      </div>
    );
  }

  // admin 섹션: middleware(UX 계층) + 이 필터로 비관리자에게 항목 숨김.
  // 실제 인가 강제는 백엔드 AdminGuard 가 담당(L2).
  const visible = NAV.filter(
    (n) => (n.section !== 'seller' || isSeller) && (n.section !== 'admin' || isAdmin),
  );

  return (
    <div className="flex min-h-screen">
      {/* 모바일 드로어 배경 오버레이 — lg 이상에서는 사이드바가 항상 보이므로 불필요 */}
      {navOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setNavOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 shrink-0 transform border-r border-border bg-surface px-4 py-6 transition-transform duration-200 ease-in-out lg:static lg:z-auto lg:w-60 lg:translate-x-0 ${
          navOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="px-2 text-lg font-semibold text-foreground">DOA Console</div>
        <nav className="mt-8 flex flex-col gap-1">
          {visible.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-control px-3 py-2 text-sm transition ${
                  active
                    ? 'bg-accent text-on-accent'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-3 border-b border-border bg-surface px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setNavOpen((v) => !v)}
              aria-label="메뉴 열기"
              aria-expanded={navOpen}
              className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-foreground transition hover:bg-muted lg:hidden"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M3 5h14M3 10h14M3 15h14" />
              </svg>
            </button>
            <div className="min-w-0 truncate text-sm text-muted-foreground">
              {profile?.email}
              {isSeller && (
                <span className="ml-2 hidden rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground sm:inline">
                  판매자 · {sellerStatus}
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <ThemeToggle />
            <button
              onClick={() => void logout().then(() => router.replace('/login'))}
              className="text-sm text-muted-foreground transition hover:text-foreground"
            >
              로그아웃
            </button>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
