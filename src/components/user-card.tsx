'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { UserAvatar } from '@/components/user-avatar';
import type { UserProfile } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Phone } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { useFirebaseApp, useUser } from '@/firebase';
import { startVideoCall } from '@/lib/calls';

interface UserCardProps {
  user: UserProfile;
}

export function UserCard({ user }: UserCardProps) {
  const { toast } = useToast();
  const app = useFirebaseApp();
  const { user: currentUser } = useUser();
  const [isCalling, setIsCalling] = useState(false);

  const handleCallClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (!currentUser) {
      toast({
        variant: 'destructive',
        title: 'Authentication Error',
        description: 'You must be logged in to place a call.',
      });
      return;
    }
    if (isCalling) return;

    setIsCalling(true);
    toast({ title: 'Starting call...', description: `Calling ${user.name}.` });

    const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    const callWindow = mobile ? null : window.open('about:blank', '_blank', 'noopener,noreferrer');
    if (!mobile && !callWindow) {
      toast({
        variant: 'destructive',
        title: 'Popup Blocked',
        description: 'Please allow pop-ups for this site to place a call.',
      });
      setIsCalling(false);
      return;
    }

    try {
      await startVideoCall(app, user.id, callWindow);
    } catch (error: any) {
      try {
        if (callWindow && !callWindow.closed) callWindow.close();
      } catch {}
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error?.message || 'Could not initiate call.',
      });
    } finally {
      setIsCalling(false);
    }
  };

  return (
    <Link href={`/users/${user.id}`} className="group">
      <Card className="h-full overflow-hidden transition-all duration-300 ease-in-out group-hover:shadow-lg group-hover:-translate-y-1">
        <CardContent className="flex flex-col items-center p-6 text-center">
          <UserAvatar
            user={user}
            className="mb-4 h-24 w-24 border-2 border-primary/20"
          />
          <h3 className="text-lg font-semibold text-foreground">{user.name}</h3>
          <p className="text-sm text-muted-foreground">{user.email}</p>

          {currentUser && currentUser.uid !== user.id && (
            <Button
              variant="outline"
              size="icon"
              className="mt-4"
              onClick={handleCallClick}
              disabled={isCalling}
              aria-label="Start video call"
              title="Start video call"
            >
              <Phone className="h-4 w-4" />
            </Button>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
