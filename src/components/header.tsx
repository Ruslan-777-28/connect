
'use client';
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { Menu, MessageSquare, Bell } from 'lucide-react';
import { Button } from './ui/button';
import { AvailabilitySwitch } from './AvailabilitySwitch';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, limit } from 'firebase/firestore';
import { useAvailability } from '@/hooks/useAvailability';
import { Skeleton } from './ui/skeleton';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export function Header() {
  const { isMobile } = useSidebar();
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { availability, isLoading: isAvailabilityLoading } = useAvailability(
    user?.uid
  );

  // Check for unread notifications
  const unreadQuery = useMemoFirebase(
    () => (user ? query(
      collection(firestore, 'notifications'),
      where('uid', '==', user.uid),
      where('readAt', '==', null),
      limit(1)
    ) : null),
    [user, firestore]
  );
  const { data: unreadNotifs } = useCollection(unreadQuery);
  const hasUnread = unreadNotifs && unreadNotifs.length > 0;

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
                {hasUnread && (
                  <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-destructive border-2 border-card" />
                )}
              </Link>
            </Button>
          </>
        )}
      </div>
    </header>
  );
}
