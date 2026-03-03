
'use client';
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { Menu, MessageSquare, Bell } from 'lucide-react';
import { Button } from './ui/button';
import { AvailabilitySwitch } from './AvailabilitySwitch';
import { useUser } from '@/firebase';
import { useAvailability } from '@/hooks/useAvailability';
import { Skeleton } from './ui/skeleton';
import Link from 'next/link';

export function Header() {
  const { isMobile } = useSidebar();
  const { user, isUserLoading } = useUser();
  const { availability, isLoading: isAvailabilityLoading } = useAvailability(
    user?.uid
  );

  // Only show the header on mobile. On desktop, the sidebar is persistent.
  if (!isMobile) {
    return null;
  }

  const isLoading = isUserLoading || isAvailabilityLoading;

  return (
    <header className="sticky top-0 z-40 grid h-16 grid-cols-3 items-center border-b bg-card/80 px-4 backdrop-blur-md">
      <div className="flex justify-start">
        <SidebarTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Toggle sidebar">
            <Menu className="h-6 w-6" />
          </Button>
        </SidebarTrigger>
      </div>

      <div className="flex justify-center">
        {isLoading ? (
          <Skeleton className="h-8 w-36" />
        ) : user ? (
          <AvailabilitySwitch
            initialAvailability={availability}
            labelClassName="text-foreground"
          />
        ) : null}
      </div>

      <div className="flex justify-end gap-1">
        {user && (
          <>
            <Button variant="ghost" size="icon" asChild>
              <Link href="/chats">
                <MessageSquare className="h-5 w-5" />
              </Link>
            </Button>
            <Button variant="ghost" size="icon" asChild className="relative">
              <Link href="/notifications">
                <Bell className="h-5 w-5" />
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-destructive border-2 border-card" />
              </Link>
            </Button>
          </>
        )}
      </div>
    </header>
  );
}
