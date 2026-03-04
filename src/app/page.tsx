
'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { collection, orderBy, query, limit } from 'firebase/firestore';
import {
  useFirestore,
  useCollection,
  useMemoFirebase,
  useUser,
} from '@/firebase';
import type { UserProfile, Post } from '@/lib/types';
import { UserCard } from '@/components/user-card';
import { PostCard } from '@/components/post-card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

export default function HomePage() {
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();

  const usersQuery = useMemoFirebase(
    () =>
      firestore && user
        ? query(collection(firestore, 'users'), orderBy('createdAt', 'desc'), limit(12))
        : null,
    [firestore, user]
  );

  const postsQuery = useMemoFirebase(
    () =>
      firestore && user
        ? query(collection(firestore, 'posts'), orderBy('createdAt', 'desc'), limit(12))
        : null,
    [firestore, user]
  );

  const { data: users, isLoading: loadingUsers } = useCollection<UserProfile>(usersQuery);
  const { data: posts, isLoading: loadingPosts } = useCollection<Post>(postsQuery);

  const combinedFeed = useMemo(() => {
    if (!users && !posts) return [];
    
    // Simple interleaving strategy
    const result = [];
    const maxLen = Math.max(users?.length || 0, posts?.length || 0);
    
    for (let i = 0; i < maxLen; i++) {
      if (users && users[i]) result.push({ type: 'user', data: users[i] });
      if (posts && posts[i]) result.push({ type: 'post', data: posts[i] });
    }
    
    return result;
  }, [users, posts]);

  const renderSkeletons = () => (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex flex-col space-y-3">
          <Skeleton className="h-[180px] w-full rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <div className="mb-10 text-center sm:text-left">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Стрічка новин
        </h1>
        <p className="mt-2 text-muted-foreground">Знаходьте цікавих людей та корисні публікації.</p>
      </div>

      {isUserLoading ? (
        renderSkeletons()
      ) : !user ? (
        <div className="flex min-h-[calc(100vh-12rem)] flex-col items-center justify-center rounded-2xl border border-dashed p-8 text-center bg-card/50">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            Ласкаво просимо до ConnectU
          </h2>
          <p className="mt-2 text-muted-foreground">
            Увійдіть, щоб переглядати стрічку та спілкуватися з фахівцями.
          </p>
          <div className="mt-6 flex gap-4">
            <Button asChild>
              <Link href="/login">Увійти</Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link href="/register">Реєстрація</Link>
            </Button>
          </div>
        </div>
      ) : loadingUsers || loadingPosts ? (
        renderSkeletons()
      ) : combinedFeed.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {combinedFeed.map((item, idx) => {
            if (item.type === 'user') {
              return <UserCard key={`u-${idx}`} user={item.data as UserProfile} />;
            }
            const post = item.data as Post;
            return <PostCard key={`p-${idx}`} post={post} userId={post.authorId} showAuthor />;
          })}
        </div>
      ) : (
        <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed bg-card/30">
          <p className="text-muted-foreground">Тут поки порожньо. Спробуйте створити свій перший пост!</p>
        </div>
      )}
    </div>
  );
}
