'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  User,
  LogOut,
  LogIn,
  UserPlus,
  Shield,
  Menu,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { UserAvatar } from './user-avatar';

export function Header() {
  const { user, userProfile, logout } = useAuth();
  const pathname = usePathname();

  const navLinks = user
    ? [
        { href: '/', label: 'Home', icon: Home },
        { href: '/profile', label: 'Profile', icon: User },
        { href: '/admin', label: 'Admin', icon: Shield },
      ]
    : [
        { href: '/login', label: 'Login', icon: LogIn },
        { href: '/register', label: 'Register', icon: UserPlus },
      ];

  const isActive = (href: string) => {
    return href === '/' ? pathname === href : pathname.startsWith(href);
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-card/80 backdrop-blur-md">
      <div className="container mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <Link
          href="/"
          className="text-2xl font-bold text-primary transition-colors hover:text-primary/80"
        >
          ConnectU
        </Link>

        <nav className="hidden items-center gap-2 md:flex">
          {navLinks.map(({ href, label, icon: Icon }) => (
            <Button
              key={label}
              variant="ghost"
              asChild
              className={cn(
                isActive(href) &&
                  'bg-accent text-accent-foreground',
                'justify-start'
              )}
            >
              <Link href={href}>
                <Icon className="mr-2 h-4 w-4" />
                {label}
              </Link>
            </Button>
          ))}
          {user && (
            <Button variant="ghost" onClick={logout}>
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          )}
        </nav>
        {user && userProfile && (
          <div className="hidden md:block">
            <UserAvatar user={userProfile} className="h-8 w-8" />
          </div>
        )}

        <div className="md:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {navLinks.map(({ href, label, icon: Icon }) => (
                <DropdownMenuItem key={label} asChild>
                  <Link href={href}>
                    <Icon className="mr-2 h-4 w-4" />
                    <span>{label}</span>
                  </Link>
                </DropdownMenuItem>
              ))}
              {user && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Logout</span>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
