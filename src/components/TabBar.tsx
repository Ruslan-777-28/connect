
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Plus, Wallet, Home, Bookmark, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs = [
  { href: '/create', label: 'Create', Icon: Plus },
  { href: '/wallet', label: 'Aktive', Icon: Wallet },
  { href: '/', label: 'Home', Icon: Home },
  { href: '/favorites', label: 'Favorit', Icon: Bookmark },
  { href: '/events', label: 'Ivent', Icon: Calendar },
];

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur-md safe-area-pb md:left-auto md:right-0 md:w-full md:max-w-none">
      <div className="mx-auto max-w-3xl px-2">
        <div className="flex items-center justify-between py-2">
          {tabs.map(({ href, label, Icon }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex w-full flex-col items-center justify-center gap-1 py-1 text-[10px] transition-colors",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <Icon className={cn("h-5 w-5", active ? "stroke-[2.5px]" : "opacity-70")} />
                <span className="font-medium">{label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
