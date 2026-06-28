'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth';

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
  { href: '/seller/products', label: '내 상품', section: 'seller' },
  { href: '/admin/sellers', label: '판매자 승인', section: 'admin' },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { loading, isAuthenticated, isSeller, sellerStatus, profile, logout } = useAuth();

  useEffect(() => {
    if (!loading && !isAuthenticated) router.replace('/login');
  }, [loading, isAuthenticated, router]);

  if (loading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-zinc-500">
        불러오는 중…
      </div>
    );
  }

  // admin 섹션은 백엔드 AdminGuard 가 최종 강제하므로 UI 에서는 항상 노출(문서화된 갭).
  const visible = NAV.filter((n) => n.section !== 'seller' || isSeller);

  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 border-r border-zinc-200 bg-white px-4 py-6">
        <div className="px-2 text-lg font-semibold text-zinc-900">DOA Console</div>
        <nav className="mt-8 flex flex-col gap-1">
          {visible.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-3 py-2 text-sm transition ${
                  active
                    ? 'bg-zinc-900 text-white'
                    : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-6">
          <div className="text-sm text-zinc-500">
            {profile?.email}
            {isSeller && (
              <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                판매자 · {sellerStatus}
              </span>
            )}
          </div>
          <button
            onClick={() => void logout().then(() => router.replace('/login'))}
            className="text-sm text-zinc-500 transition hover:text-zinc-900"
          >
            로그아웃
          </button>
        </header>
        <main className="flex-1 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
