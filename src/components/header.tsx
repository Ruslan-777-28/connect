'use client';
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { Menu } from 'lucide-react';
import { Button } from './ui/button';

export function Header() {
  const { isMobile } = useSidebar();

  // Only show the header on mobile. On desktop, the sidebar is persistent.
  if (!isMobile) {
    return null;
  }

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center border-b bg-card/80 px-4 backdrop-blur-md">
      <SidebarTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Toggle sidebar">
          <Menu className="h-6 w-6" />
        </Button>
      </SidebarTrigger>
    </header>
  );
}
