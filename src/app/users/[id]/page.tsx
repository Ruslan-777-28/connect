
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
import { Video, FileText, HelpCircle, Phone, Send, Loader2 } from 'lucide-react';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { Textarea } from '@/components/ui/textarea';
import { getFunctions, httpsCallable } from 'firebase/functions';

export default function UserProfilePage() {
  const params = useParams();
  const router = useRouter();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const firestore = useFirestore();
  const { toast } = useToast();
  const app = useFirebaseApp();
  const { user: currentUser } = useUser();
  
  const [isCalling, setIsCalling] = useState(false);
  const [isOrdering, setIsOrdering] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<CommunicationOffer | null>(null);
  const [questionText, setQuestionText] = useState('');

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const userDocRef = useMemoFirebase(
    () => (id ? doc(firestore, 'users', id) : null),
    [id, firestore]
  );

  const { data: userProfile, isLoading: loading } = useDoc<UserProfile>(userDocRef);
  
  const offersQuery = useMemoFirebase(
    () => (id ? query(
      collection(firestore, 'communicationOffers'), 
      where('ownerId', '==', id), 
      where('status', '==', 'active')
    ) : null),
    [id, firestore]
  );
  
  const { data: offers, isLoading: loadingOffers } = useCollection<CommunicationOffer>(offersQuery);

  const online = isInstantOnline(userProfile?.availability);

  const categories = useMemo(() => {
    if (!offers) return [];
    return Array.from(new Set(offers.map(o => o.categoryId))).sort();
  }, [offers]);

  const filteredOffers = useMemo(() => {
    if (!offers) return [];
    if (!selectedCategory) return offers;
    return offers.filter(o => o.categoryId === selectedCategory);
  }, [offers, selectedCategory]);

  useEffect(() => {
    if (categories.length > 0 && !selectedCategory) setSelectedCategory(categories[0]);
  }, [categories, selectedCategory]);

  const handleOrderClick = (offer: CommunicationOffer) => {
    if (!currentUser) {
      toast({
        variant: 'destructive',
        title: 'Потрібна авторизація',
        description: 'Будь ласка, увійдіть в систему, щоб зробити замовлення.',
        action: <ToastAction altText="Login" onClick={() => router.push('/login')}>Увійти</ToastAction>
      });
      return;
    }
    setSelectedOffer(offer);
  };

  const handleCreateRequest = async () => {
    if (!selectedOffer || !currentUser) return;
    setIsOrdering(true);
    try {
      const functions = getFunctions(app, 'us-central1');
      const createReq = httpsCallable(functions, 'createCommunicationRequest');
      await createReq({
        offerId: selectedOffer.id,
        type: selectedOffer.type,
        questionText: questionText
      });
      toast({ title: 'Надіслано', description: 'Ваш запит з\'явився в розділі Aktive.' });
      setSelectedOffer(null);
      setQuestionText('');
      router.push('/wallet');
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Помилка', description: e.message });
    } finally {
      setIsOrdering(false);
    }
  };

  const handleCallClick = async (offerId: string) => {
    if (!userProfile || !currentUser) {
      toast({ 
        variant: 'destructive', 
        title: 'Потрібна авторизація', 
        description: 'Увійдіть, щоб здійснити виклик.',
        action: <ToastAction altText="Login" onClick={() => router.push('/login')}>Увійти</ToastAction>
      });
      return;
    }
    setIsCalling(true);
    try {
      const { callId } = await startVideoCall(app, userProfile.id, offerId);
      router.push(`/call/${callId}`);
    } catch (error: any) {
      setIsCalling(false);
      toast({ variant: 'destructive', title: 'Помилка', description: error.message });
    }
  };

  if (loading) return <div className="container mx-auto p-4"><Skeleton className="h-32 w-full" /></div>;
  if (!userProfile) return <div className="container mx-auto p-4">User not found</div>;

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8 pb-24">
      <Card className="overflow-hidden mb-8">
        <div className="h-32 bg-primary/20" />
        <CardContent className="relative -mt-16 flex flex-col items-center p-6 text-center">
          <UserAvatar user={userProfile} className="h-32 w-32 border-4 border-card" />
          <h1 className="mt-4 text-3xl font-bold">{userProfile.name}</h1>
          <p className="mt-4 max-w-prose text-foreground/80">{userProfile.bio}</p>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <h2 className="text-2xl font-bold tracking-tight">Пропозиції</h2>
        
        {loadingOffers ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : offers && offers.length > 0 ? (
          <div className="space-y-8">
            <Carousel className="w-full">
              <CarouselContent className="-ml-2">
                {categories.map((cat) => (
                  <CarouselItem key={cat} className="pl-2 basis-auto">
                    <Button 
                      variant={selectedCategory === cat ? "default" : "outline"} 
                      className="rounded-full" 
                      onClick={() => setSelectedCategory(cat)}
                    >
                      {cat}
                    </Button>
                  </CarouselItem>
                ))}
              </CarouselContent>
            </Carousel>

            <div className="grid gap-4 sm:grid-cols-2">
              {filteredOffers.map((offer) => (
                <Card key={offer.id} className="border-primary/10 hover:border-primary/30 transition-colors">
                  <CardContent className="p-6 flex flex-col h-full gap-4">
                    <div className="flex justify-between">
                      <div className="flex items-center gap-3">
                        <div className="rounded-full bg-primary/10 p-2 text-primary">
                          {offer.type === 'video' ? (
                            <Video className="h-5 w-5" />
                          ) : offer.type === 'file' ? (
                            <FileText className="h-5 w-5" />
                          ) : (
                            <HelpCircle className="h-5 w-5" />
                          )}
                        </div>
                        <div>
                          <h3 className="font-semibold text-sm capitalize">{offer.subcategoryId}</h3>
                          <span className="text-[10px] text-muted-foreground uppercase">{offer.type}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold">
                          {offer.pricing.ratePerMinute || offer.pricing.ratePerFile || offer.pricing.ratePerQuestion} COIN
                        </div>
                        <span className="text-[10px] text-muted-foreground">/{offer.type === 'video' ? 'хв' : offer.type === 'file' ? 'файл' : 'пит'}</span>
                      </div>
                    </div>

                    <Button 
                      className={cn(
                        "w-full mt-auto font-bold", 
                        offer.type !== 'video' ? "bg-green-600 hover:bg-green-700 text-white" : "bg-primary text-primary-foreground"
                      )}
                      disabled={isCalling || (offer.type === 'video' && !online)}
                      onClick={() => {
                        if (offer.type === 'video') {
                          handleCallClick(offer.id);
                        } else {
                          handleOrderClick(offer);
                        }
                      }}
                    >
                      {offer.type === 'video' ? (
                        <><Phone className="mr-2 h-4 w-4" /> Виклик</>
                      ) : (
                        <><Send className="mr-2 h-4 w-4" /> Замовити</>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-12 border border-dashed rounded-xl">
            Немає доступних пропозицій.
          </p>
        )}
      </div>

      {/* Order Dialog */}
      <Dialog open={!!selectedOffer} onOpenChange={(open) => !open && setSelectedOffer(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Нове замовлення</DialogTitle>
            <DialogDescription>
              Введіть ваше запитання нижче. Сума винагороди буде зарезервована на вашому балансі до моменту підтвердження отримання відповіді.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea 
              placeholder="Ваше запитання фахівцю..." 
              className="min-h-[150px] resize-none" 
              value={questionText} 
              onChange={e => setQuestionText(e.target.value)} 
            />
          </div>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button variant="outline" className="flex-1" onClick={() => setSelectedOffer(null)}>Скасувати</Button>
            <Button 
              className="flex-1 bg-green-600 hover:bg-green-700 text-white" 
              onClick={handleCreateRequest} 
              disabled={!questionText.trim() || isOrdering}
            >
              {isOrdering ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Підтвердити замовлення'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
