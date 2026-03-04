
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
import { Video, FileText, HelpCircle, Phone, RefreshCw, Edit2, Send, Loader2 } from 'lucide-react';
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
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);

  const isOwner = currentUser?.uid === id;

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

  const subcategories = useMemo(() => {
    if (!offers || !selectedCategory) return [];
    return Array.from(new Set(offers.filter(o => o.categoryId === selectedCategory).map(o => o.subcategoryId))).sort();
  }, [offers, selectedCategory]);

  const filteredOffers = useMemo(() => {
    if (!offers || !selectedCategory || !selectedSubcategory) return [];
    return offers.filter(o => o.categoryId === selectedCategory && o.subcategoryId === selectedSubcategory);
  }, [offers, selectedCategory, selectedSubcategory]);

  useEffect(() => {
    if (categories.length > 0 && !selectedCategory) setSelectedCategory(categories[0]);
  }, [categories, selectedCategory]);

  useEffect(() => {
    if (subcategories.length > 0 && !selectedSubcategory) setSelectedSubcategory(subcategories[0]);
  }, [subcategories, selectedSubcategory]);

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
      toast({ variant: 'destructive', title: 'Error', description: 'Log in to place a call.' });
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
        
        {loadingOffers ? <Skeleton className="h-48 w-full" /> : offers && offers.length > 0 ? (
          <div className="space-y-8">
            <Carousel className="w-full">
              <CarouselContent className="-ml-2">
                {categories.map((cat) => (
                  <CarouselItem key={cat} className="pl-2 basis-auto">
                    <Button variant={selectedCategory === cat ? "default" : "outline"} className="rounded-full" onClick={() => setSelectedCategory(cat)}>{cat}</Button>
                  </CarouselItem>
                ))}
              </CarouselContent>
            </Carousel>

            <div className="grid gap-4 sm:grid-cols-2">
              {filteredOffers.map((offer) => (
                <Card key={offer.id} className="border-primary/10">
                  <CardContent className="p-6 flex flex-col h-full gap-4">
                    <div className="flex justify-between">
                      <div className="flex items-center gap-3">
                        <div className="rounded-full bg-primary/10 p-2 text-primary">
                          {offer.type === 'video' ? <Video className="h-5 w-5" /> : offer.type === 'file' ? <FileText className="h-5 w-5" /> : <HelpCircle className="h-5 w-5" />}
                        </div>
                        <h3 className="font-semibold text-sm capitalize">{offer.subcategoryId}</h3>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold">
                          {offer.pricing.ratePerMinute || offer.pricing.ratePerFile || offer.pricing.ratePerQuestion} COIN
                        </div>
                        <span className="text-[10px] text-muted-foreground">/{offer.type === 'video' ? 'хв' : offer.type === 'file' ? 'файл' : 'пит'}</span>
                      </div>
                    </div>

                    <Button 
                      className={cn("w-full mt-auto", offer.type !== 'video' && "bg-green-600 hover:bg-green-700")}
                      disabled={isCalling || (offer.type === 'video' && !online)}
                      onClick={() => {
                        if (offer.type === 'video') handleCallClick(offer.id);
                        else setSelectedOffer(offer);
                      }}
                    >
                      {offer.type === 'video' ? <><Phone className="mr-2 h-4 w-4" /> Виклик</> : <><Send className="mr-2 h-4 w-4" /> Замовити</>}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : <p className="text-center text-muted-foreground">Немає пропозицій.</p>}
      </div>

      {/* Order Dialog */}
      <Dialog open={!!selectedOffer} onOpenChange={o => !o && setSelectedOffer(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Нове замовлення</DialogTitle>
            <DialogDescription>Введіть ваше запитання нижче. Сума винагороди буде зарезервована.</DialogDescription>
          </DialogHeader>
          <Textarea 
            placeholder="Ваше запитання..." 
            className="min-h-[120px]" 
            value={questionText} 
            onChange={e => setQuestionText(e.target.value)} 
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedOffer(null)}>Скасувати</Button>
            <Button className="bg-green-600" onClick={handleCreateRequest} disabled={!questionText || isOrdering}>
              {isOrdering ? <Loader2 className="animate-spin" /> : 'Підтвердити'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
