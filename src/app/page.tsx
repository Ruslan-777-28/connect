'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { UserProfile } from '@/lib/types';
import { UserCard } from '@/components/user-card';
import { Skeleton } from '@/components/ui/skeleton';

export default function HomePage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const usersCollection = collection(db, 'users');
        const q = query(usersCollection, orderBy('createdAt', 'desc'));
        const querySnapshot = await getDocs(q);
        const usersData = querySnapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as UserProfile
        );
        setUsers(usersData);
      } catch (error) {
        console.error('Error fetching users:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, []);

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
      ) : users.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {users.map((user) => (
            <UserCard key={user.uid} user={user} />
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
