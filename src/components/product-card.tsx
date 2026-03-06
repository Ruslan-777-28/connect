
'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent } from '@/components/ui/card';
import type { DigitalProduct, UserProfile } from '@/lib/types';
import { Package, ShoppingCart } from 'lucide-react';
import { useDoc, useFirestore, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { UserAvatar } from './user-avatar';
import { Skeleton } from './ui/skeleton';
import { FavoriteButton } from './FavoriteButton';
import { LikeButton } from './LikeButton';

interface ProductCardProps {
  product: DigitalProduct;
  showAuthor?: boolean;
}

export function ProductCard({ product, showAuthor }: ProductCardProps) {
  const firestore = useFirestore();
  const userDocRef = useMemoFirebase(
    () => (showAuthor ? doc(firestore, 'users', product.authorId) : null),
    [firestore, product.authorId, showAuthor]
  );
  const { data: author, isLoading: loadingAuthor } = useDoc<UserProfile>(userDocRef);

  return (
    <div className="group relative h-full">
      <div className="absolute top-2 left-2 z-20">
        <FavoriteButton 
          targetId={product.id} 
          type="product" 
          className="bg-background/60 backdrop-blur-md hover:bg-background/80 shadow-sm" 
        />
      </div>
      <Link href={`/users/${product.authorId}/products/${product.id}`}>
        <Card className="h-full overflow-hidden border-primary/5 hover:border-primary/20 transition-all group shadow-sm hover:shadow-md">
          <div className="relative aspect-square w-full bg-muted">
            {product.imageUrl ? (
              <Image
                src={product.imageUrl}
                alt={product.title}
                fill
                className="object-cover transition-transform group-hover:scale-105"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground/30 bg-primary/5">
                <Package className="h-10 w-10 opacity-20" />
              </div>
            )}
            <div className="absolute top-2 right-2 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-1 rounded-full shadow-lg">
              {product.price} COIN
            </div>
          </div>
          <CardContent className="p-4">
            {showAuthor && (
              <div className="flex items-center gap-2 mb-2">
                {loadingAuthor ? (
                  <Skeleton className="h-5 w-5 rounded-full" />
                ) : author ? (
                  <>
                    <UserAvatar user={author} className="h-5 w-5" />
                    <span className="text-[10px] font-semibold truncate">{author.name}</span>
                  </>
                ) : null}
              </div>
            )}
            
            <h3 className="font-bold text-xs line-clamp-1 mb-1 group-hover:text-primary transition-colors">
              {product.title}
            </h3>
            <p className="text-[10px] text-muted-foreground line-clamp-2 mb-3 h-[2.2rem]">
              {product.description}
            </p>
            
            <div className="flex items-center justify-between pt-2 border-t border-primary/5">
               <div className="flex items-center gap-2">
                 <span className="text-[9px] text-muted-foreground uppercase font-medium">{product.subcategoryId}</span>
                 <ShoppingCart className="h-3 w-3 text-primary" />
               </div>
               <LikeButton targetId={product.id} type="product" />
            </div>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}
