'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { collection, orderBy, query } from 'firebase/firestore';
import {
  useFirestore,
  useCollection,
  useMemoFirebase,
  useUser,
} from '@/firebase';
import type { UserProfile } from '@/lib/types';
import { UserCard } from '@/components/user-card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

export default function HomePage() {
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();

  const usersQuery = useMemoFirebase(
    () =>
      firestore && user
        ? query(collection(firestore, 'users'), orderBy('createdAt', 'desc'))
        : null,
    [firestore, user]
  );

  const { data: users, isLoading: loadingUsers } =
    useCollection<UserProfile>(usersQuery);

  const renderSkeletons = () => (
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
  );

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <h1 className="mb-8 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
        User Directory
      </h1>
      {isUserLoading ? (
        renderSkeletons()
      ) : !user ? (
        <div className="flex min-h-[calc(100vh-12rem)] flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            Welcome to ConnectU
          </h2>
          <p className="mt-2 text-muted-foreground">
            Log in to connect with other users and view the directory.
          </p>
          <div className="mt-6 flex gap-4">
            <Button asChild>
              <Link href="/login">Log In</Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link href="/register">Sign Up</Link>
            </Button>
          </div>
        </div>
      ) : loadingUsers ? (
        renderSkeletons()
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
