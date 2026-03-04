'use client';

import { useMemo } from 'react';
import { useUser, useFirestore, useDoc, useMemoFirebase, useCollection } from '@/firebase';
import { doc, collection, query, where, orderBy } from 'firebase/firestore';
import { ProfileForm } from '@/components/profile-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { UserProfile, CommunicationOffer } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Video, FileText, HelpCircle, Edit2, Layout, MoreHorizontal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

export default function ProfilePage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();

  const userDocRef = useMemoFirebase(
    () => (user ? doc(firestore, 'users', user.uid) : null),
    [user, firestore]
  );
  
  const { data: userProfile, isLoading: isProfileLoading } = useDoc<UserProfile>(userDocRef);

  // Отримуємо пропозиції поточного користувача через useCollection
  const offersQuery = useMemoFirebase(
    () => (user ? query(
      collection(firestore, 'communicationOffers'), 
      where('ownerId', '==', user.uid),
      orderBy('createdAt', 'desc')
    ) : null),
    [user, firestore]
  );
  
  const { data: offers, isLoading: loadingOffers } = useCollection<CommunicationOffer>(offersQuery);

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

        {/* Нова секція Постів */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold tracking-tight">Мої пости</h2>
            <Button variant="outline" size="sm">
              Створити пост
            </Button>
          </div>

          <div className="grid gap-4">
            {/* Тимчасові картки-заглушки для візуалізації */}
            <Card className="overflow-hidden border-primary/5">
              <CardContent className="p-0">
                <div className="aspect-video w-full bg-muted flex items-center justify-center">
                  <Layout className="h-10 w-10 text-muted-foreground/50" />
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold">Назва майбутнього посту</h3>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    Тут буде відображатися текст вашої публікації. Користувачі зможуть читати ваші думки, оновлення або корисні поради...
                  </p>
                  <div className="mt-4 flex items-center gap-4 text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                    <span>12 ВЕРЕСНЯ</span>
                    <span>•</span>
                    <span>154 ПЕРЕГЛЯДИ</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-dashed">
              <CardContent className="p-12 text-center text-muted-foreground flex flex-col items-center gap-2">
                <div className="rounded-full bg-muted p-3 mb-2">
                  <Layout className="h-6 w-6 opacity-40" />
                </div>
                <p className="font-medium text-sm">У вас поки немає опублікованих постів</p>
                <p className="text-xs">Діліться своїми знаннями та залучайте більше клієнтів.</p>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </div>
  );
}
