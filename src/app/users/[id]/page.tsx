
'use client';

import { useMemo, useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, collection, query, where } from 'firebase/firestore';
import { useFirestore, useDoc, useMemoFirebase, useUser, useFirebaseApp, useCollection } from '@/firebase';
import type { UserProfile, CommunicationOffer } from '@/lib/types';
import { UserAvatar } from '@/components/user-avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Video, FileText, HelpCircle, Phone, RefreshCw, Edit2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { startVideoCall } from '@/lib/calls';
import { isInstantOnline } from '@/lib/availability';
import { cn } from '@/lib/utils';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import { ToastAction } from '@/components/ui/toast';

export default function UserProfilePage() {
  const params = useParams();
  const router = useRouter();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const firestore = useFirestore();
  const { toast } = useToast();
  const app = useFirebaseApp();
  const { user: currentUser } = useUser();
  const [isCalling, setIsCalling] = useState(false);

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);

  const isOwner = currentUser?.uid === id;

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

  const categories = useMemo(() => {
    if (!offers) return [];
    const unique = Array.from(new Set(offers.map(o => o.categoryId)));
    return unique.sort();
  }, [offers]);

  const subcategories = useMemo(() => {
    if (!offers || !selectedCategory) return [];
    const filtered = offers.filter(o => o.categoryId === selectedCategory);
    const unique = Array.from(new Set(filtered.map(o => o.subcategoryId)));
    return unique.sort();
  }, [offers, selectedCategory]);

  const filteredOffers = useMemo(() => {
    if (!offers || !selectedCategory || !selectedSubcategory) return [];
    return offers.filter(o => o.categoryId === selectedCategory && o.subcategoryId === selectedSubcategory);
  }, [offers, selectedCategory, selectedSubcategory]);

  useEffect(() => {
    if (categories.length > 0 && !selectedCategory) {
      setSelectedCategory(categories[0]);
    }
  }, [categories, selectedCategory]);

  useEffect(() => {
    if (subcategories.length > 0 && !selectedSubcategory) {
      setSelectedSubcategory(subcategories[0]);
    } else if (subcategories.length > 0 && selectedSubcategory && !subcategories.includes(selectedSubcategory)) {
        setSelectedSubcategory(subcategories[0]);
    }
  }, [subcategories, selectedSubcategory]);

  const handleCallClick = async (offerId: string) => {
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
    
    try {
      const { callId } = await startVideoCall(app, userProfile.id, offerId);
      router.push(`/call/${callId}`);
    } catch (error: any) {
      setIsCalling(false);
      
      if (error.message === 'INSUFFICIENT_BALANCE') {
        toast({
          variant: 'destructive',
          title: 'Недостатньо COIN',
          description: 'Поповніть баланс для здійснення дзвінків.',
          action: (
            <ToastAction altText="Поповнити" onClick={() => router.push('/wallet')}>
              Поповнити
            </ToastAction>
          ),
        });
      } else if (error.message === 'OFFER_NOT_FOUND') {
        toast({
          variant: 'destructive',
          title: 'Пропозицію оновлено',
          description: 'Ця послуга більше не доступна в поточному вигляді. Будь ласка, оберіть актуальний варіант.',
          action: (
            <ToastAction altText="Оновити" onClick={() => window.location.reload()}>
              <RefreshCw className="mr-2 h-4 w-4" /> Оновити
            </ToastAction>
          ),
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Помилка',
          description: error.message || 'Не вдалося ініціювати виклик.',
        });
      }
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <div className="flex animate-pulse flex-col items-center gap-4 text-center">
          <Skeleton className="h-32 w-32 rounded-full" />
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
    );
  }

  if (!userProfile) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-8 text-center">
        <h1 className="text-2xl font-bold">User not found</h1>
      </div>
    );
  }

  const joinDate =
    userProfile.createdAt && userProfile.createdAt.seconds
      ? new Date(userProfile.createdAt.seconds * 1000).toLocaleDateString(
          'uk-UA',
          { year: 'numeric', month: 'long', day: 'numeric' }
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
          {userProfile.bio && (
            <p className="mt-4 max-w-prose text-foreground/80">
              {userProfile.bio}
            </p>
          )}
          <p className="mt-4 text-sm text-muted-foreground">
            Joined on {joinDate}
          </p>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <h2 className="text-2xl font-bold tracking-tight">Пропозиції</h2>
        
        {loadingOffers ? (
          <div className="space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-3/4" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : offers && offers.length > 0 ? (
          <div className="space-y-8">
            <div className="space-y-4">
              <Carousel className="w-full" opts={{ align: "start" }}>
                <CarouselContent className="-ml-2">
                  {categories.map((cat) => (
                    <CarouselItem key={cat} className="pl-2 basis-auto">
                      <Button
                        variant={selectedCategory === cat ? "default" : "outline"}
                        className="rounded-full capitalize"
                        onClick={() => setSelectedCategory(cat)}
                      >
                        {cat}
                      </Button>
                    </CarouselItem>
                  ))}
                </CarouselContent>
              </Carousel>

              {subcategories.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2 border-t">
                  {subcategories.map((sub) => (
                    <Button
                      key={sub}
                      variant={selectedSubcategory === sub ? "secondary" : "ghost"}
                      size="sm"
                      className={cn(
                        "rounded-full capitalize h-8 text-xs",
                        selectedSubcategory === sub && "bg-secondary text-secondary-foreground"
                      )}
                      onClick={() => setSelectedSubcategory(sub)}
                    >
                      {sub}
                    </Button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {filteredOffers.map((offer) => (
                <Card key={offer.id} className="relative overflow-hidden transition-all hover:shadow-md border-primary/10">
                  <CardContent className="p-6">
                    <div className="flex flex-col h-full gap-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="rounded-full bg-primary/10 p-2 text-primary">
                            {offer.type === 'video' && <Video className="h-5 w-5" />}
                            {offer.type === 'file' && <FileText className="h-5 w-5" />}
                            {offer.type === 'text' && <HelpCircle className="h-5 w-5" />}
                          </div>
                          <div>
                            <h3 className="font-semibold text-sm capitalize">{offer.categoryId}</h3>
                            <p className="text-xs text-muted-foreground capitalize">{offer.subcategoryId}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold">
                             {offer.pricing.ratePerMinute && `${offer.pricing.ratePerMinute}`}
                             {offer.pricing.ratePerFile && `${offer.pricing.ratePerFile}`}
                             {offer.pricing.ratePerQuestion && `${offer.pricing.ratePerQuestion}`}
                             <span className="ml-1 text-xs">COIN</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground uppercase">
                             {offer.type === 'video' ? '/ хв' : offer.type === 'file' ? '/ файл' : '/ пит'}
                          </span>
                        </div>
                      </div>

                      {isOwner ? (
                        <Button 
                          className="w-full mt-auto" 
                          variant="outline"
                          onClick={() => router.push(`/create/communication?type=${offer.type}&id=${offer.id}`)}
                        >
                          <Edit2 className="mr-2 h-4 w-4" />
                          Редагувати
                        </Button>
                      ) : (
                        <Button 
                          className="w-full mt-auto" 
                          variant={offer.type === 'video' ? "default" : "secondary"}
                          disabled={offer.type === 'video' ? (isCalling || !online) : false}
                          onClick={() => {
                            if (offer.type === 'video') handleCallClick(offer.id);
                          }}
                        >
                          {offer.type === 'video' ? (
                            <>
                              <Phone className="mr-2 h-4 w-4" />
                              {isCalling ? 'Починаємо...' : (online ? 'Виклик' : 'Недоступний')}
                            </>
                          ) : 'Замовити'}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {filteredOffers.length === 0 && (
                <div className="col-span-full py-12 text-center text-muted-foreground bg-muted/20 rounded-xl border border-dashed">
                  Оберіть категорію та підкатегорію для перегляду пропозицій.
                </div>
              )}
            </div>
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
