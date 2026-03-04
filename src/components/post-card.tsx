
'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent } from '@/components/ui/card';
import type { Post, UserProfile } from '@/lib/types';
import { Eye, Calendar } from 'lucide-react';
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { UserAvatar } from './user-avatar';
import { Skeleton } from './ui/skeleton';
import { FavoriteButton } from './FavoriteButton';
import { LikeButton } from './LikeButton';

interface PostCardProps {
  post: Post;
  userId: string;
  showAuthor?: boolean;
}

export function PostCard({ post, userId, showAuthor }: PostCardProps) {
  const firestore = useFirestore();
  const userDocRef = useMemoFirebase(
    () => (showAuthor ? doc(firestore, 'users', userId) : null),
    [firestore, userId, showAuthor]
  );
  const { data: author, isLoading: loadingAuthor } = useDoc<UserProfile>(userDocRef);

  const date = post.createdAt?.toDate?.() || new Date(post.createdAt);
  const formattedDate = date.toLocaleDateString('uk-UA', {
    day: 'numeric',
    month: 'long',
  }).toUpperCase();

  return (
    <div className="group relative h-full">
      <div className="absolute top-2 right-2 z-20">
        <FavoriteButton 
          targetId={post.id} 
          type="post" 
          className="bg-background/60 backdrop-blur-md hover:bg-background/80 shadow-sm" 
        />
      </div>
      <Link href={`/users/${userId}/posts/${post.id}`}>
        <Card className="h-full overflow-hidden border-primary/5 hover:border-primary/20 transition-all group shadow-sm hover:shadow-md">
          <div className="relative aspect-video w-full bg-muted">
            {post.imageUrl ? (
              <Image
                src={post.imageUrl}
                alt={post.title}
                fill
                className="object-cover transition-transform group-hover:scale-105"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground/30 bg-primary/5">
                No Image
              </div>
            )}
          </div>
          <CardContent className="p-4">
            {showAuthor && (
              <div className="flex items-center gap-2 mb-3">
                {loadingAuthor ? (
                  <Skeleton className="h-6 w-6 rounded-full" />
                ) : author ? (
                  <>
                    <UserAvatar user={author} className="h-6 w-6" />
                    <span className="text-[11px] font-semibold truncate">{author.name}</span>
                  </>
                ) : null}
              </div>
            )}
            
            <h3 className="font-bold text-sm line-clamp-1 mb-1 group-hover:text-primary transition-colors">
              {post.title}
            </h3>
            <p className="text-xs text-muted-foreground line-clamp-2 mb-3 h-[2.5rem]">
              {post.content}
            </p>
            <div className="flex items-center justify-between text-[9px] text-muted-foreground uppercase font-bold tracking-wider pt-2 border-t border-primary/5">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {formattedDate}
                </span>
                <span className="flex items-center gap-1">
                  <Eye className="h-3 w-3" />
                  {post.viewCount || 0}
                </span>
              </div>
              <LikeButton targetId={post.id} type="post" />
            </div>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}
