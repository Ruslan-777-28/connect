'use client';

import { useMemo } from 'react';
import { collection, orderBy, query } from 'firebase/firestore';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import type { UserProfile } from '@/lib/types';
import { UserCard } from '@/components/user-card';
import { Skeleton } from '@/components/ui/skeleton';

export default function HomePage() {
  const firestore = useFirestore();

  const usersQuery = useMemoFirebase(
    () =>
      firestore
        ? query(collection(firestore, 'users'), orderBy('createdAt', 'desc'))
        : null,
    [firestore]
  );

  const { data: users, isLoading: loading } = useCollection<UserProfile>(usersQuery);

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <h1 className="mb-8 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
        User Directory
      </h1>
      {loading ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex flex-col space-y-3">
              <Skeleton className="h-[125px] w-full rounded-xl" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : users && users.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {users.map((user) => (
            <UserCard key={user.id} user={user} />
          ))}
        </div>
      ) : (
        <div className="flex h-64 items-center justify-center rounded-lg border border-dashed">
          <p className="text-muted-foreground">No users found.</p>
        </div>
      )}
    </div>
  );
}
