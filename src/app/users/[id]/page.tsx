
'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, collection, query, where } from 'firebase/firestore';
import { useFirestore, useDoc, useMemoFirebase, useUser, useFirebaseApp, useCollection } from '@/firebase';
import type { UserProfile, CommunicationOffer } from '@/lib/types';
import { UserAvatar } from '@/components/user-avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Phone, Video, FileText, HelpCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { startVideoCall } from '@/lib/calls';
import { isInstantOnline } from '@/lib/availability';
import { Badge } from '@/components/ui/badge';

export default function UserProfilePage() {
  const params = useParams();
  const router = useRouter();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const firestore = useFirestore();
  const { toast } = useToast();
  const app = useFirebaseApp();
  const { user: currentUser } = useUser();
  const [isCalling, setIsCalling] = useState(false);

  const userDocRef = useMemoFirebase(
    () => (id ? doc(firestore, 'users', id) : null),
    [id, firestore]
  );

  const { data: userProfile, isLoading: loading } = useDoc<UserProfile>(userDocRef);
  
  const offersQuery = useMemoFirebase(
    () => (id ? query(collection(firestore, 'communicationOffers'), where('ownerId', '==', id), where('status', '==', 'active')) : null),
    [id, firestore]
  );
  
  const { data: offers, isLoading: loadingOffers } = useCollection<CommunicationOffer>(offersQuery);

  const online = isInstantOnline(userProfile?.availability);

  const handleCallClick = async () => {
    if (!userProfile || !currentUser) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'You must be logged in to place a call.',
      });
      return;
    }
    if (isCalling) return;

    setIsCalling(true);
    toast({
      title: 'Starting call...',
      description: `Calling ${userProfile.name}.`,
    });

    try {
      const { callId } = await startVideoCall(app, userProfile.id);
      router.push(`/call/${callId}`);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Could not initiate call.',
      });
      setIsCalling(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <div className="flex animate-pulse flex-col items-center gap-4 text-center">
          <Skeleton className="h-32 w-32 rounded-full" />
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
    );
  }

  if (!userProfile) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-8 text-center">
        <h1 className="text-2xl font-bold">User not found</h1>
        <p>The profile you are looking for does not exist.</p>
      </div>
    );
  }

  const joinDate =
    userProfile.createdAt && userProfile.createdAt.seconds
      ? new Date(userProfile.createdAt.seconds * 1000).toLocaleDateString(
          'en-US',
          {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }
        )
      : 'N/A';

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8 pb-24">
      <Card className="overflow-hidden mb-8">
        <div className="h-32 bg-primary/20" />
        <CardContent className="relative -mt-16 flex flex-col items-center p-6 text-center">
          <UserAvatar
            user={userProfile}
            className="h-32 w-32 border-4 border-card"
          />
          <h1 className="mt-4 text-3xl font-bold">{userProfile.name}</h1>
          <p className="text-muted-foreground">{userProfile.email}</p>
          {userProfile.bio && (
            <p className="mt-4 max-w-prose text-foreground/80">
              {userProfile.bio}
            </p>
          )}
          <p className="mt-4 text-sm text-muted-foreground">
            Joined on {joinDate}
          </p>
          {currentUser && currentUser.uid !== userProfile.id && (
            <Button
              variant={online ? 'default' : 'secondary'}
              className="mt-6"
              onClick={handleCallClick}
              disabled={isCalling || !online}
              aria-label={online ? 'Start video call' : 'User is not available for calls'}
            >
              <Phone className="mr-2 h-4 w-4" />
              {online ? 'Call Now' : 'Currently Unavailable'}
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="space-y-6">
        <h2 className="text-2xl font-bold tracking-tight">Пропозиції</h2>
        
        {loadingOffers ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
          </div>
        ) : offers && offers.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {offers.map((offer) => (
              <Card key={offer.id} className="relative overflow-hidden transition-shadow hover:shadow-md">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-full bg-primary/10 p-2 text-primary">
                        {offer.type === 'video' && <Video className="h-5 w-5" />}
                        {offer.type === 'file' && <FileText className="h-5 w-5" />}
                        {offer.type === 'text' && <HelpCircle className="h-5 w-5" />}
                      </div>
                      <div>
                        <h3 className="font-semibold capitalize">{offer.type === 'video' ? 'Відеочат' : offer.type === 'file' ? 'Файл + повідомлення' : 'Питання та відповідь'}</h3>
                        <p className="text-sm text-muted-foreground">{offer.categoryId} / {offer.subcategoryId}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-lg font-bold">
                      {offer.pricing.ratePerMinute && `$${offer.pricing.ratePerMinute}/хв`}
                      {offer.pricing.ratePerFile && `$${offer.pricing.ratePerFile}/файл`}
                      {offer.pricing.ratePerQuestion && `$${offer.pricing.ratePerQuestion}/пит`}
                    </Badge>
                  </div>
                  <Button className="mt-6 w-full" variant="secondary" disabled={offer.type !== 'video'}>
                    Замовити
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
            Користувач ще не створив пропозицій.
          </div>
        )}
      </div>
    </div>
  );
}
