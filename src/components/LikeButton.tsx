
'use client';

import { useState } from 'react';
import { Heart, Loader2 } from 'lucide-react';
import { useUser, useFirestore, useCollection, useMemoFirebase, addDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase';
import { collection, query, where, doc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Like, LikeType } from '@/lib/types';
import { serverTimestamp } from 'firebase/firestore';

interface LikeButtonProps {
  targetId: string;
  type: LikeType;
  className?: string;
}

export function LikeButton({ targetId, type, className }: LikeButtonProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const [isBusy, setIsBusy] = useState(false);

  // Fetch all likes for this target to get the count
  const allLikesQuery = useMemoFirebase(
    () => (targetId ? query(
      collection(firestore, 'likes'),
      where('targetId', '==', targetId),
      where('type', '==', type)
    ) : null),
    [targetId, type, firestore]
  );

  const { data: allLikes, isLoading } = useCollection<Like>(allLikesQuery);
  
  const userLike = allLikes?.find(l => l.uid === user?.uid);
  const isLiked = !!userLike;
  const count = allLikes?.length || 0;

  const toggleLike = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!user || !firestore || isBusy || !allLikes) return;

    setIsBusy(true);
    try {
      if (isLiked && userLike) {
        // Remove like
        deleteDocumentNonBlocking(doc(firestore, 'likes', userLike.id));
      } else {
        // Add like
        addDocumentNonBlocking(collection(firestore, 'likes'), {
          uid: user.uid,
          targetId,
          type,
          createdAt: serverTimestamp(),
        });
      }
    } catch (err) {
      console.error('Error toggling like:', err);
    } finally {
      setIsBusy(false);
    }
  };

  if (!user) return null;

  return (
    <Button
      variant="ghost"
      className={cn(
        "h-8 px-2 flex items-center gap-1.5 transition-all duration-200",
        isLiked ? "text-red-500" : "text-muted-foreground",
        className
      )}
      onClick={toggleLike}
      disabled={isLoading || isBusy}
    >
      {isBusy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Heart className={cn("h-4 w-4", isLiked && "fill-current")} />
      )}
      <span className="text-[11px] font-extrabold tabular-nums">
        {count}
      </span>
    </Button>
  );
}
