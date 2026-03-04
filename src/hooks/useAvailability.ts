'use client';
import { useMemo } from 'react';
import { doc } from 'firebase/firestore';
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import type { UserProfile, Availability } from '@/lib/types';

export function useAvailability(userId: string | null | undefined) {
  const firestore = useFirestore();

  const userDocRef = useMemoFirebase(
    () => (userId ? doc(firestore, 'users', userId) : null),
    [userId, firestore]
  );
  
  const { data: userProfile, isLoading, error } = useDoc<UserProfile>(userDocRef);

  const availability = useMemo<Availability | null>(() => {
    if (!userProfile?.availability) {
      return { status: 'offline' };
    }
    // Check if 'online' status has expired
    if (userProfile.availability.status === 'online') {
      const now = new Date();
      const until = userProfile.availability.until?.toDate();
      if (until && now > until) {
        return { status: 'offline' }; // Expired
      }
    }
    return userProfile.availability;
  }, [userProfile]);

  return { availability, isLoading, error };
}
