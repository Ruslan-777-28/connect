
'use client';

import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Eye, Calendar, User, Layout, Loader2 } from 'lucide-react';
import { useDoc, useFirestore, useMemoFirebase, useCollection } from '@/firebase';
import { doc, collection, query, where, orderBy, limit } from 'firebase/firestore';
import type { Post, UserProfile } from '@/lib/types';
import { UserAvatar } from '@/components/user-avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { PostCard } from '@/components/post-card';
import { LikeButton } from '@/components/LikeButton';
import { CommentButton } from '@/components/CommentButton';
import { FavoriteButton } from '@/components/FavoriteButton';

export default function ExpandedPostPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const postId = params.postId as string;
  const firestore = useFirestore();

  const userDocRef = useMemoFirebase(() => doc(firestore, 'users', id), [firestore, id]);
  const { data: userProfile, isLoading: userLoading } = useDoc<UserProfile>(userDocRef);

  const postDocRef = useMemoFirebase(() => doc(firestore, 'posts', postId), [firestore, postId]);
  const { data: currentPost, isLoading: postLoading } = useDoc<Post>(postDocRef);

  const otherPostsQuery = useMemoFirebase(() => 
    query(
      collection(firestore, 'posts'),
      where('authorId', '==', id),
      orderBy('createdAt', 'desc'),
      limit(6)
    ), [firestore, id]);
  
  const { data: otherPosts, isLoading: otherLoading } = useCollection<Post>(otherPostsQuery);

  if (postLoading) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-8 flex flex-col items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Завантаження публікації...</p>
      </div>
    );
  }

  if (!currentPost) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-8 text-center">
        <h1 className="text-2xl font-bold">Публікацію не знайдено</h1>
        <Button variant="link" onClick={() => router.back()} className="mt-4">
          Повернутися назад
        </Button>
      </div>
    );
  }

  const date = currentPost.createdAt?.toDate?.() || new Date(currentPost.createdAt);
    
  const formattedDate = date.toLocaleDateString('uk-UA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8 pb-24">
      <div className="flex items-center justify-between mb-6">
        <Button 
          variant="ghost" 
          className="-ml-2 text-muted-foreground"
          onClick={() => router.back()}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Назад
        </Button>
        <FavoriteButton targetId={postId} type="post" />
      </div>

      <div className="grid gap-12">
        {/* Повний пост */}
        <article className="space-y-6">
          <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-muted shadow-lg">
            {currentPost.imageUrl ? (
              <Image 
                src={currentPost.imageUrl} 
                alt={currentPost.title}
                fill
                className="object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-primary/5 text-muted-foreground/20 italic">
                Немає зображення
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{currentPost.title}</h1>
            <div className="flex items-center gap-4 text-sm text-muted-foreground font-medium uppercase tracking-wider">
              <span className="flex items-center gap-1.5 bg-muted px-2 py-1 rounded">
                <Calendar className="h-4 w-4" />
                {formattedDate}
              </span>
              <span className="flex items-center gap-1.5 bg-muted px-2 py-1 rounded">
                <Eye className="h-4 w-4" />
                {currentPost.viewCount || 0} ПЕРЕГЛЯДІВ
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between py-4 border-y">
            {userLoading ? (
              <Skeleton className="h-12 w-12 rounded-full" />
            ) : userProfile ? (
              <div className="flex items-center gap-3">
                <UserAvatar user={userProfile} className="h-12 w-12" />
                <div>
                  <p className="font-bold">{userProfile.name}</p>
                  <p className="text-xs text-muted-foreground">Автор публікації</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                  <User className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="font-bold">Користувач</p>
              </div>
            )}

            <div className="flex items-center gap-4">
              <CommentButton postId={postId} />
              <LikeButton targetId={postId} type="post" />
            </div>
          </div>

          <div className="prose prose-neutral dark:prose-invert max-w-none">
            <p className="text-lg leading-relaxed text-foreground/90 whitespace-pre-wrap">
              {currentPost.content}
            </p>
          </div>
        </article>

        {/* Стрічка всіх постів автора */}
        <section className="space-y-8 pt-8 border-t">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold tracking-tight">Всі публікації автора</h2>
            <Button variant="link" onClick={() => router.push(`/users/${id}`)}>
              Дивитися всі
            </Button>
          </div>

          {otherLoading ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 w-full rounded-xl" />)}
            </div>
          ) : otherPosts && otherPosts.length > 1 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {otherPosts.filter(p => p.id !== postId).map((post) => (
                <PostCard key={post.id} post={post} userId={id} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground italic border border-dashed rounded-xl">
               У автора більше немає інших публікацій.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
