
'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent } from '@/components/ui/card';
import type { Post } from '@/lib/types';
import { Eye, Calendar } from 'lucide-react';

interface PostCardProps {
  post: Post;
  userId: string;
}

export function PostCard({ post, userId }: PostCardProps) {
  const date = post.createdAt?.toDate?.() || new Date(post.createdAt);
  const formattedDate = date.toLocaleDateString('uk-UA', {
    day: 'numeric',
    month: 'long',
  }).toUpperCase();

  return (
    <Link href={`/users/${userId}/posts/${post.id}`}>
      <Card className="h-full overflow-hidden border-primary/5 hover:border-primary/20 transition-all group">
        <div className="relative aspect-video w-full bg-muted">
          {post.imageUrl ? (
            <Image
              src={post.imageUrl}
              alt={post.title}
              fill
              className="object-cover transition-transform group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground/30">
              No Image
            </div>
          )}
        </div>
        <CardContent className="p-4">
          <h3 className="font-bold text-sm line-clamp-1 mb-1 group-hover:text-primary transition-colors">
            {post.title}
          </h3>
          <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
            {post.content}
          </p>
          <div className="flex items-center gap-3 text-[9px] text-muted-foreground uppercase font-bold tracking-wider">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formattedDate}
            </span>
            <span className="flex items-center gap-1">
              <Eye className="h-3 w-3" />
              {post.viewCount}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
