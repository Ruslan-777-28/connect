'use client';
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { Menu } from 'lucide-react';
import { Button } from './ui/button';
import { AvailabilitySwitch } from './AvailabilitySwitch';
import { useUser } from '@/firebase';
import { useAvailability } from '@/hooks/useAvailability';
import { Skeleton } from './ui/skeleton';

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

      {/* Empty div for grid alignment */}
      <div />
    </header>
  );
}
