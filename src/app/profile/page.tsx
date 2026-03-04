
'use client';

import { useMemo } from 'react';
import { useUser, useFirestore, useDoc, useMemoFirebase, useCollection } from '@/firebase';
import { doc, collection, query, where, orderBy } from 'firebase/firestore';
import { ProfileForm } from '@/components/profile-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { UserProfile, CommunicationOffer } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Video, FileText, HelpCircle, Edit2 } from 'lucide-react';
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
          My Profile
        </h1>
        <Card>
          <CardHeader>
            <CardTitle>Edit Profile</CardTitle>
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
        My Profile
      </h1>
      
      <div className="grid gap-8">
        <Card>
          <CardHeader>
            <CardTitle>Edit Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <ProfileForm userProfile={userProfile} />
          </CardContent>
        </Card>

        <section className="space-y-6">
          <h2 className="text-2xl font-bold tracking-tight">Мої пропозиції</h2>
          
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
                      <div className="text-sm font-bold">
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
                Ви ще не створили жодної пропозиції. Перейдіть до розділу "Create", щоб почати.
              </CardContent>
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}
