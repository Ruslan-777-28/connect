
'use client';

import { useMemo } from 'react';
import { useUser, useFirestore, useDoc, useMemoFirebase, useCollection } from '@/firebase';
import { doc, collection, query, where, orderBy } from 'firebase/firestore';
import { ProfileForm } from '@/components/profile-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { UserProfile, CommunicationOffer, Post } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Video, FileText, HelpCircle, Edit2, Layout } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import { PostCard } from '@/components/post-card';

export default function ProfilePage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();

  const userDocRef = useMemoFirebase(
    () => (user ? doc(firestore, 'users', user.uid) : null),
    [user, firestore]
  );
  
  const { data: userProfile, isLoading: isProfileLoading } = useDoc<UserProfile>(userDocRef);

  const offersQuery = useMemoFirebase(
    () => (user ? query(
      collection(firestore, 'communicationOffers'), 
      where('ownerId', '==', user.uid),
      orderBy('createdAt', 'desc')
    ) : null),
    [user, firestore]
  );
  
  const { data: offers, isLoading: loadingOffers } = useCollection<CommunicationOffer>(offersQuery);

  const postsQuery = useMemoFirebase(
    () => (user ? query(
      collection(firestore, 'posts'),
      where('authorId', '==', user.uid),
      orderBy('createdAt', 'desc')
    ) : null),
    [user, firestore]
  );

  const { data: myPosts, isLoading: loadingPosts } = useCollection<Post>(postsQuery);

  const loading = isUserLoading || isProfileLoading;

  if (loading || !userProfile) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <h1 className="mb-8 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Мій профіль
        </h1>
        <Card>
          <CardHeader>
            <CardTitle>Редагувати профіль</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
             <Skeleton className="h-24 w-24 rounded-full" />
             <Skeleton className="h-8 w-1/2" />
             <Skeleton className="h-20 w-full" />
             <Skeleton className="h-10 w-24" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8 pb-24">
      <h1 className="mb-8 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
        Мій профіль
      </h1>
      
      <div className="grid gap-8">
        <Card>
          <CardHeader>
            <CardTitle>Редагувати профіль</CardTitle>
          </CardHeader>
          <CardContent>
            <ProfileForm userProfile={userProfile} />
          </CardContent>
        </Card>

        {/* Секція Пропозицій */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold tracking-tight">Мої пропозиції</h2>
            <Button variant="outline" size="sm" onClick={() => router.push('/create')}>
              Додати
            </Button>
          </div>
          
          {loadingOffers ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Skeleton className="h-32 w-full rounded-xl" />
              <Skeleton className="h-32 w-full rounded-xl" />
            </div>
          ) : offers && offers.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {offers.map((offer) => (
                <Card key={offer.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {offer.type === 'video' && <Video className="h-4 w-4 text-primary" />}
                        {offer.type === 'file' && <FileText className="h-4 w-4 text-primary" />}
                        {offer.type === 'text' && <HelpCircle className="h-4 w-4 text-primary" />}
                        <span className="font-semibold capitalize">{offer.type === 'video' ? 'Відеочат' : offer.type === 'file' ? 'Файл' : 'Питання'}</span>
                      </div>
                      <Badge variant={offer.status === 'active' ? 'default' : 'secondary'}>
                        {offer.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">{offer.categoryId} / {offer.subcategoryId}</p>
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-bold text-primary">
                        {offer.pricing.ratePerMinute && `${offer.pricing.ratePerMinute} COIN/хв`}
                        {offer.pricing.ratePerFile && `${offer.pricing.ratePerFile} COIN/файл`}
                        {offer.pricing.ratePerQuestion && `${offer.pricing.ratePerQuestion} COIN/пит`}
                      </div>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="h-8 w-8 p-0"
                        onClick={() => router.push(`/create/communication?type=${offer.type}&id=${offer.id}`)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center text-muted-foreground">
                Ви ще не створили жодної пропозиції.
              </CardContent>
            </Card>
          )}
        </section>

        {/* Секція Постів */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold tracking-tight">Мої пости</h2>
            <Button variant="outline" size="sm" onClick={() => router.push('/create/post')}>
              Створити пост
            </Button>
          </div>

          {loadingPosts ? (
            <div className="flex gap-4">
              <Skeleton className="h-48 w-64 rounded-xl" />
              <Skeleton className="h-48 w-64 rounded-xl" />
            </div>
          ) : myPosts && myPosts.length > 0 ? (
            <Carousel
              opts={{
                align: "start",
                loop: false,
              }}
              className="w-full"
            >
              <CarouselContent className="-ml-2 md:-ml-4">
                {myPosts.map((post) => (
                  <CarouselItem key={post.id} className="pl-2 md:pl-4 basis-[85%] sm:basis-[45%] lg:basis-[33%]">
                    <PostCard post={post} userId={user?.uid || ''} />
                  </CarouselItem>
                ))}
              </CarouselContent>
            </Carousel>
          ) : (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center text-muted-foreground flex flex-col items-center gap-2">
                <Layout className="h-8 w-8 opacity-20" />
                <p>Ви ще не опублікували жодного посту.</p>
              </CardContent>
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}
