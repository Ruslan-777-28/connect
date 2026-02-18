'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc } from 'firebase/firestore';
import { useFirestore, useDoc, useMemoFirebase, useUser, useFirebaseApp } from '@/firebase';
import type { UserProfile } from '@/lib/types';
import { UserAvatar } from '@/components/user-avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Phone } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { startVideoCall } from '@/lib/calls';

export default function UserProfilePage() {
  const params = useParams();
  const router = useRouter();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const firestore = useFirestore();
  const { toast } = useToast();
  const app = useFirebaseApp();
  const { user: currentUser } = useUser();
  const [isCalling, setIsCalling] = useState(false);

  const userDocRef = useMemoFirebase(
    () => (id ? doc(firestore, 'users', id) : null),
    [id, firestore]
  );

  const { data: userProfile, isLoading: loading } = useDoc<UserProfile>(userDocRef);

  const handleCallClick = async () => {
    if (!userProfile || !currentUser) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'You must be logged in to place a call.',
      });
      return;
    }
    if (isCalling) return;

    setIsCalling(true);
    toast({
      title: 'Starting call...',
      description: `Calling ${userProfile.name}.`,
    });

    try {
      const { callId } = await startVideoCall(app, userProfile.id);
      router.push(`/call/${callId}`);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Could not initiate call.',
      });
      setIsCalling(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <div className="flex animate-pulse flex-col items-center gap-4 text-center">
          <Skeleton className="h-32 w-32 rounded-full" />
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
    );
  }

  if (!userProfile) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-8 text-center">
        <h1 className="text-2xl font-bold">User not found</h1>
        <p>The profile you are looking for does not exist.</p>
      </div>
    );
  }

  const joinDate =
    userProfile.createdAt && userProfile.createdAt.seconds
      ? new Date(userProfile.createdAt.seconds * 1000).toLocaleDateString(
          'en-US',
          {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }
        )
      : 'N/A';

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <Card className="overflow-hidden">
        <div className="h-32 bg-primary/20" />
        <CardContent className="relative -mt-16 flex flex-col items-center p-6 text-center">
          <UserAvatar
            user={userProfile}
            className="h-32 w-32 border-4 border-card"
          />
          <h1 className="mt-4 text-3xl font-bold">{userProfile.name}</h1>
          <p className="text-muted-foreground">{userProfile.email}</p>
          {userProfile.bio && (
            <p className="mt-4 max-w-prose text-foreground/80">
              {userProfile.bio}
            </p>
          )}
          <p className="mt-4 text-sm text-muted-foreground">
            Joined on {joinDate}
          </p>
          {currentUser && currentUser.uid !== userProfile.id && (
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
    </div>
  );
}
