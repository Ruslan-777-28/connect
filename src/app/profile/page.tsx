'use client';

import { useMemo } from 'react';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { ProfileForm } from '@/components/profile-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { UserProfile } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';

export default function ProfilePage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const userDocRef = useMemoFirebase(
    () => (user ? doc(firestore, 'users', user.uid) : null),
    [user, firestore]
  );
  
  const { data: userProfile, isLoading: isProfileLoading } = useDoc<UserProfile>(userDocRef);

  const loading = isUserLoading || isProfileLoading;

  if (loading || !userProfile) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <h1 className="mb-8 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          My Profile
        </h1>
        <Card>
          <CardHeader>
            <CardTitle>Edit Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
             <Skeleton className="h-24 w-24 rounded-full" />
             <Skeleton className="h-8 w-1/2" />
             <Skeleton className="h-20 w-full" />
             <Skeleton className="h-10 w-24" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-8 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
        My Profile
      </h1>
      <Card>
        <CardHeader>
          <CardTitle>Edit Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm userProfile={userProfile} />
        </CardContent>
      </Card>
    </div>
  );
}
