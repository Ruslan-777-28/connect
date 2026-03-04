
'use client';

import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Users, Layout, Package } from 'lucide-react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy } from 'firebase/firestore';
import type { Favorite, UserProfile, Post, DigitalProduct } from '@/lib/types';
import { UserCard } from '@/components/user-card';
import { PostCard } from '@/components/post-card';
import { ProductCard } from '@/components/product-card';

export default function FavoritesPage() {
  const [activeTab, setActiveTab] = useState('accounts');
  const { user } = useUser();
  const firestore = useFirestore();

  // Query favorites
  const favoritesQuery = useMemoFirebase(
    () => (user ? query(
      collection(firestore, 'favorites'),
      where('uid', '==', user.uid),
      orderBy('createdAt', 'desc')
    ) : null),
    [user, firestore]
  );

  const { data: favorites, isLoading: loadingFavorites } = useCollection<Favorite>(favoritesQuery);

  // Split favorites by type
  const favoritedUserIds = (favorites || []).filter(f => f.type === 'user').map(f => f.targetId);
  const favoritedPostIds = (favorites || []).filter(f => f.type === 'post').map(f => f.targetId);
  const favoritedProductIds = (favorites || []).filter(f => f.type === 'product').map(f => f.targetId);

  // Fetch actual data for favorites
  // For MVP, we'll fetch all items and filter locally since Firestore IN query has limits
  // and we want to keep it simple without complex multi-doc fetching hooks for now.
  const allUsersQuery = useMemoFirebase(() => query(collection(firestore, 'users')), [firestore]);
  const allPostsQuery = useMemoFirebase(() => query(collection(firestore, 'posts')), [firestore]);
  const allProductsQuery = useMemoFirebase(() => query(collection(firestore, 'products')), [firestore]);

  const { data: allUsers } = useCollection<UserProfile>(allUsersQuery);
  const { data: allPosts } = useCollection<Post>(allPostsQuery);
  const { data: allProducts } = useCollection<DigitalProduct>(allProductsQuery);

  const favUsers = (allUsers || []).filter(u => favoritedUserIds.includes(u.id));
  const favPosts = (allPosts || []).filter(p => favoritedPostIds.includes(p.id));
  const favProducts = (allProducts || []).filter(p => favoritedProductIds.includes(p.id));

  const isLoading = loadingFavorites;

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8 pb-24">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Favorit</h1>
        <p className="text-muted-foreground mt-1">Ваші збережені вподобання.</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-8">
          <TabsTrigger value="accounts" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Акаунти</span>
            <span className="sm:hidden text-xs">Акаунти</span>
          </TabsTrigger>
          <TabsTrigger value="posts" className="flex items-center gap-2">
            <Layout className="h-4 w-4" />
            <span className="hidden sm:inline">Пости</span>
            <span className="sm:hidden text-xs">Пости</span>
          </TabsTrigger>
          <TabsTrigger value="products" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            <span className="hidden sm:inline">Товари</span>
            <span className="sm:hidden text-xs">Товари</span>
          </TabsTrigger>
        </TabsList>

        {isLoading ? (
          <div className="flex justify-center py-24">
            <Loader2 className="h-12 w-12 animate-spin text-primary opacity-20" />
          </div>
        ) : (
          <ScrollArea className="h-[calc(100vh-280px)]">
            <TabsContent value="accounts" className="mt-0">
              {favUsers.length > 0 ? (
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {favUsers.map(u => <UserCard key={u.id} user={u} />)}
                </div>
              ) : (
                <EmptyState icon={<Users className="h-12 w-12" />} title="Немає збережених акаунтів" />
              )}
            </TabsContent>

            <TabsContent value="posts" className="mt-0">
              {favPosts.length > 0 ? (
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {favPosts.map(p => <PostCard key={p.id} post={p} userId={p.authorId} showAuthor />)}
                </div>
              ) : (
                <EmptyState icon={<Layout className="h-12 w-12" />} title="Немає збережених постів" />
              )}
            </TabsContent>

            <TabsContent value="products" className="mt-0">
              {favProducts.length > 0 ? (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {favProducts.map(p => <ProductCard key={p.id} product={p} showAuthor />)}
                </div>
              ) : (
                <EmptyState icon={<Package className="h-12 w-12" />} title="Немає збережених товарів" />
              )}
            </TabsContent>
          </ScrollArea>
        )}
      </Tabs>
    </div>
  );
}

function EmptyState({ icon, title }: { icon: React.ReactNode, title: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center border border-dashed rounded-2xl bg-muted/20">
      <div className="mb-4 text-muted-foreground/20">{icon}</div>
      <h3 className="text-lg font-semibold text-muted-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground/60 mt-1 max-w-[200px]">
        Натисніть на іконку прапорця на картці, щоб додати сюди контент.
      </p>
    </div>
  );
}
