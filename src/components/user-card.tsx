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
import { useRouter } from 'next/navigation';
import { isInstantOnline } from '@/lib/availability';

interface UserCardProps {
  user: UserProfile;
}

export function UserCard({ user }: UserCardProps) {
  const { toast } = useToast();
  const app = useFirebaseApp();
  const { user: currentUser } = useUser();
  const [isCalling, setIsCalling] = useState(false);
  const router = useRouter();
  const online = isInstantOnline(user.availability);

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

    try {
      const { callId } = await startVideoCall(app, user.id);
      router.push(`/call/${callId}`);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error?.message || 'Could not initiate call.',
      });
      setIsCalling(false);
    }
  };

  return (
    <Link href={`/users/${user.id}`} className="group">
      <Card className="h-full overflow-hidden transition-all duration-300 ease-in-out group-hover:shadow-lg group-hover:-translate-y-1">
        <CardContent className="flex flex-col items-center p-6 text-center">
          <UserAvatar
            user={user}
            className="mb-4 h-24 w-24"
          />
          <h3 className="text-lg font-semibold text-foreground">{user.name}</h3>
          <p className="text-sm text-muted-foreground">{user.email}</p>

          {currentUser && currentUser.uid !== user.id && (
             <Button
              variant={online ? "default" : "outline"}
              size="sm"
              className="mt-4"
              onClick={handleCallClick}
              disabled={isCalling || !online}
              aria-label={online ? "Start video call" : "User is not available for calls"}
             >
              <Phone className="h-4 w-4" />
              <span className="ml-2">{online ? 'Call Now' : 'Unavailable'}</span>
            </Button>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
