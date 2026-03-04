
'use client';

import { useState } from 'react';
import { BookmarkPlus, BookmarkCheck, Loader2 } from 'lucide-react';
import { useUser, useFirestore, useCollection, useMemoFirebase, addDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase';
import { collection, query, where, doc } from 'firebase/firestore';
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

  // Fetch all favorites for this target to get the count
  const allFavoritesQuery = useMemoFirebase(
    () => (targetId ? query(
      collection(firestore, 'favorites'),
      where('targetId', '==', targetId),
      where('type', '==', type)
    ) : null),
    [targetId, type, firestore]
  );

  const { data: allFavs, isLoading } = useCollection<Favorite>(allFavoritesQuery);
  
  const userFavorite = allFavs?.find(f => f.uid === user?.uid);
  const isFavorited = !!userFavorite;
  const count = allFavs?.length || 0;

  const toggleFavorite = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!user || !firestore || isBusy || !allFavs) return;

    setIsBusy(true);
    try {
      if (isFavorited && userFavorite) {
        // Remove favorite
        deleteDocumentNonBlocking(doc(firestore, 'favorites', userFavorite.id));
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
      className={cn(
        "rounded-full h-8 px-2 flex items-center gap-1.5 transition-all duration-200",
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
      <span className="text-[11px] font-extrabold tabular-nums">
        {count}
      </span>
    </Button>
  );
}
