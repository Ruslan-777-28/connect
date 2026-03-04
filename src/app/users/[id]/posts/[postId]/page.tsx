
'use client';

import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Eye, Calendar, User } from 'lucide-react';
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import type { Post, UserProfile } from '@/lib/types';
import { UserAvatar } from '@/components/user-avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { PostCard } from '@/components/post-card';

// Demo data for the feed below the main post
const DEMO_ALL_POSTS: Post[] = [
  {
    id: '1',
    authorId: 'demo',
    title: 'Основи успішної комунікації',
    content: 'У цій статті ми розберемо основні принципи того, як ефективно спілкуватися з клієнтами та партнерами. Чому активне слухання є ключовим і як правильно ставити запитання, щоб отримати максимум інформації. Ми також розглянемо психологічні аспекти взаємодії та способи вирішення конфліктних ситуацій ще на етапі їх зародження.',
    imageUrl: 'https://picsum.photos/seed/post1/600/400',
    viewCount: 154,
    createdAt: new Date('2024-09-12'),
  },
  {
    id: '2',
    authorId: 'demo',
    title: 'Нові тренди в дизайні 2024',
    content: 'Огляд актуальних напрямків, які будуть домінувати в індустрії протягом наступного року. Від мінімалізму до нео-футуризму. Ми дослідимо кольорові палітри, які стануть популярними, та нові підходи до типографіки, що допомагають виділитися на фоні конкурентів.',
    imageUrl: 'https://picsum.photos/seed/post2/600/400',
    viewCount: 89,
    createdAt: new Date('2024-09-05'),
  },
  {
    id: '3',
    authorId: 'demo',
    title: 'Як працювати з клієнтами',
    content: 'Практичні поради щодо управління очікуваннями клієнтів та побудови довгострокових відносин у фрілансі. Як правильно формувати комерційні пропозиції та захищати свої кордони.',
    imageUrl: 'https://picsum.photos/seed/post3/600/400',
    viewCount: 210,
    createdAt: new Date('2024-08-28'),
  }
];

export default function ExpandedPostPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const postId = params.postId as string;
  const firestore = useFirestore();

  const userDocRef = useMemoFirebase(() => doc(firestore, 'users', id), [firestore, id]);
  const { data: userProfile, isLoading: userLoading } = useDoc<UserProfile>(userDocRef);

  // In a real app, we would fetch the specific post from Firestore
  // For now, we find it in our demo data
  const currentPost = DEMO_ALL_POSTS.find(p => p.id === postId) || DEMO_ALL_POSTS[0];

  const date = currentPost.createdAt instanceof Date 
    ? currentPost.createdAt 
    : (currentPost.createdAt?.toDate?.() || new Date(currentPost.createdAt));
    
  const formattedDate = date.toLocaleDateString('uk-UA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8 pb-24">
      <Button 
        variant="ghost" 
        className="mb-6 -ml-2 text-muted-foreground"
        onClick={() => router.back()}
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Назад до профілю
      </Button>

      <div className="grid gap-12">
        {/* Повний пост */}
        <article className="space-y-6">
          <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-muted shadow-lg">
            {currentPost.imageUrl && (
              <Image 
                src={currentPost.imageUrl} 
                alt={currentPost.title}
                fill
                className="object-cover"
              />
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
                {currentPost.viewCount} ПЕРЕГЛЯДІВ
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4 py-4 border-y">
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

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {DEMO_ALL_POSTS.filter(p => p.id !== postId).map((post) => (
              <PostCard key={post.id} post={post} userId={id} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
