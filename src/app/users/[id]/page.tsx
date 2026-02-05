'use client';

import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { UserProfile } from '@/lib/types';
import { UserAvatar } from '@/components/user-avatar';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function UserProfilePage({ params }: { params: { id: string } }) {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (params.id) {
      const fetchUserProfile = async () => {
        setLoading(true);
        const userDocRef = doc(db, 'users', params.id);
        const docSnap = await getDoc(userDocRef);
        if (docSnap.exists()) {
          setUserProfile(docSnap.data() as UserProfile);
        } else {
          // Handle user not found
          console.log('No such document!');
        }
        setLoading(false);
      };
      fetchUserProfile();
    }
  }, [params.id]);

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

  const joinDate = userProfile.createdAt
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
        <CardContent className="flex flex-col items-center p-6 text-center -mt-16">
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
        </CardContent>
      </Card>
    </div>
  );
}
