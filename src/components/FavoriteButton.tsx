
'use client';

import { useState, useEffect } from 'react';
import { BookmarkPlus, BookmarkCheck, Loader2 } from 'lucide-react';
import { useUser, useFirestore, useCollection, useMemoFirebase, addDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase';
import { collection, query, where, doc, limit } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Favorite, FavoriteType } from '@/lib/types';
import { serverTimestamp } from 'firebase/firestore';

interface FavoriteButtonProps {
  targetId: string;
  type: FavoriteType;
  className?: string;
}

export function FavoriteButton({ targetId, type, className }: FavoriteButtonProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const [isBusy, setIsBusy] = useState(false);

  // Check if already favorited
  const favoriteQuery = useMemoFirebase(
    () => (user && targetId ? query(
      collection(firestore, 'favorites'),
      where('uid', '==', user.uid),
      where('targetId', '==', targetId),
      where('type', '==', type),
      limit(1)
    ) : null),
    [user, targetId, type, firestore]
  );

  const { data: favorites, isLoading } = useCollection<Favorite>(favoriteQuery);
  const isFavorited = favorites && favorites.length > 0;

  const toggleFavorite = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!user || !firestore || isBusy) return;

    setIsBusy(true);
    try {
      if (isFavorited) {
        // Remove favorite
        deleteDocumentNonBlocking(doc(firestore, 'favorites', favorites[0].id));
      } else {
        // Add favorite
        addDocumentNonBlocking(collection(firestore, 'favorites'), {
          uid: user.uid,
          targetId,
          type,
          createdAt: serverTimestamp(),
        });
      }
    } catch (err) {
      console.error('Error toggling favorite:', err);
    } finally {
      setIsBusy(false);
    }
  };

  if (!user) return null;

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        "rounded-full h-8 w-8",
        isFavorited ? "text-primary" : "text-muted-foreground",
        className
      )}
      onClick={toggleFavorite}
      disabled={isLoading || isBusy}
    >
      {isBusy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : isFavorited ? (
        <BookmarkCheck className="h-4 w-4 fill-current" />
      ) : (
        <BookmarkPlus className="h-4 w-4" />
      )}
    </Button>
  );
}
