
'use client';

import { useMemo, useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, collection, query, where, orderBy } from 'firebase/firestore';
import { useFirestore, useDoc, useMemoFirebase, useUser, useFirebaseApp, useCollection } from '@/firebase';
import type { UserProfile, CommunicationOffer, Post, DigitalProduct } from '@/lib/types';
import { UserAvatar } from '@/components/user-avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Video, FileText, HelpCircle, Phone, Send, Loader2, Layout, Package, Calendar, Globe, History } from 'lucide-react';
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
import { PostCard } from '@/components/post-card';
import { ProductCard } from '@/components/product-card';
import { CalendarView } from '@/components/CalendarView';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

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
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [withTranslator, setWithTranslator] = useState(false);
  const [saveTranscript, setSaveTranscript] = useState(false);

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

  const postsQuery = useMemoFirebase(
    () => (id ? query(collection(firestore, 'posts'), where('authorId', '==', id), orderBy('createdAt', 'desc')) : null),
    [id, firestore]
  );
  const { data: userPosts, isLoading: loadingPosts } = useCollection<Post>(postsQuery);

  const productsQuery = useMemoFirebase(
    () => (id ? query(collection(firestore, 'products'), where('authorId', '==', id), orderBy('createdAt', 'desc')) : null),
    [id, firestore]
  );
  const { data: userProducts, isLoading: loadingProducts } = useCollection<DigitalProduct>(productsQuery);

  const online = isInstantOnline(userProfile?.availability);

  // Filter out scheduled offers from the main "Services" list, they go to the calendar
  const instantOffers = useMemo(() => {
    if (!offers) return [];
    return offers.filter(o => o.schedulingType !== 'scheduled');
  }, [offers]);

  const scheduledOffers = useMemo(() => {
    if (!offers) return [];
    return offers.filter(o => o.schedulingType === 'scheduled');
  }, [offers]);

  const categories = useMemo(() => {
    return Array.from(new Set(instantOffers.map(o => o.categoryId))).sort();
  }, [instantOffers]);

  const filteredOffers = useMemo(() => {
    if (!selectedCategory) return instantOffers;
    return instantOffers.filter(o => o.categoryId === selectedCategory);
  }, [instantOffers, selectedCategory]);

  useEffect(() => {
    if (categories.length > 0 && !selectedCategory) setSelectedCategory(categories[0]);
  }, [categories, selectedCategory]);

  const handleOrderClick = (offer: CommunicationOffer) => {
    if (!currentUser) {
      toast({
        variant: 'destructive',
        title: 'Потрібна авторизація',
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
        action: <ToastAction altText="Login" onClick={() => router.push('/login')}>Увійти</ToastAction>
      });
      return;
    }
    setIsCalling(true);
    try {
      const { callId } = await startVideoCall(app, userProfile.id, offerId, {
        translationEnabled: withTranslator,
        transcriptEnabled: saveTranscript
      });
      router.push(`/call/${callId}`);
    } catch (error: any) {
      setIsCalling(false);
      toast({ variant: 'destructive', title: 'Помилка', description: error.message });
    }
  };

  if (loading) return <div className="container mx-auto p-4"><Skeleton className="h-32 w-full" /></div>;
  if (!userProfile) return <div className="container mx-auto p-4">User not found</div>;

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8 pb-32">
      <Card className="overflow-hidden mb-8">
        <div className="h-32 bg-primary/20" />
        <CardContent className="relative -mt-16 flex flex-col items-center p-6 text-center">
          <UserAvatar user={userProfile} className="h-32 w-32 border-4 border-card" />
          <h1 className="mt-4 text-3xl font-bold">{userProfile.name}</h1>
          <p className="mt-4 max-w-prose text-foreground/80">{userProfile.bio}</p>
          
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button 
              variant="outline" 
              className="rounded-full flex items-center gap-2"
              onClick={() => setIsCalendarOpen(true)}
            >
              <Calendar className="h-4 w-4 text-primary" />
              <span>Календар</span>
              {scheduledOffers.length > 0 && (
                <span className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full">
                  {scheduledOffers.length}
                </span>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-12">
        {/* Секція Магазину */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Package className="h-6 w-6 text-primary" /> Мій магазин
          </h2>
          {loadingProducts ? (
            <div className="flex gap-4">
              <Skeleton className="h-48 w-40 rounded-xl" />
            </div>
          ) : userProducts && userProducts.length > 0 ? (
            <Carousel opts={{ align: "start" }} className="w-full">
              <CarouselContent className="-ml-2 md:-ml-4">
                {userProducts.map((p) => (
                  <CarouselItem key={p.id} className="pl-2 md:pl-4 basis-[45%] sm:basis-[30%] lg:basis-[22%]">
                    <ProductCard product={p} />
                  </CarouselItem>
                ))}
              </CarouselContent>
            </Carousel>
          ) : (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center text-muted-foreground">
                У цього автора поки немає товарів у магазині.
              </CardContent>
            </Card>
          )}
        </section>

        {/* Секція Пропозицій Комунікації (Instant) */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold tracking-tight">Послуги комунікації</h2>
          {loadingOffers ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Skeleton className="h-48 w-full" />
            </div>
          ) : instantOffers.length > 0 ? (
            <div className="space-y-8">
              {categories.length > 1 && (
                <Carousel className="w-full">
                  <CarouselContent className="-ml-2">
                    {categories.map((cat) => (
                      <CarouselItem key={cat} className="pl-2 basis-auto">
                        <Button variant={selectedCategory === cat ? "default" : "outline"} className="rounded-full" onClick={() => setSelectedCategory(cat)}>
                          {cat}
                        </Button>
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                </Carousel>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                {filteredOffers.map((offer) => (
                  <Card key={offer.id} className="border-primary/10 hover:border-primary/30 transition-colors">
                    <CardContent className="p-6 flex flex-col h-full gap-4">
                      <div className="flex justify-between">
                        <div className="flex items-center gap-3">
                          <div className="rounded-full bg-primary/10 p-2 text-primary">
                            {offer.type === 'video' ? <Video className="h-5 w-5" /> : offer.type === 'file' ? <FileText className="h-5 w-5" /> : <HelpCircle className="h-5 w-5" />}
                          </div>
                          <div>
                            <h3 className="font-semibold text-sm capitalize">{offer.subcategoryId}</h3>
                            <span className="text-[10px] text-muted-foreground uppercase">{offer.type}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold">{offer.pricing.ratePerMinute || offer.pricing.ratePerFile || offer.pricing.ratePerQuestion} COIN</div>
                          <span className="text-[10px] text-muted-foreground">/{offer.type === 'video' ? 'хв' : offer.type === 'file' ? 'файл' : 'пит'}</span>
                        </div>
                      </div>

                      {offer.type === 'video' && (
                        <div className="space-y-3 py-2 border-t border-b border-primary/5">
                          <div className="flex items-center space-x-2">
                            <Checkbox id="translator" checked={withTranslator} onCheckedChange={(val) => setWithTranslator(!!val)} />
                            <Label htmlFor="translator" className="text-xs flex items-center gap-1.5 cursor-pointer">
                              <Globe className="h-3 w-3 text-primary" /> Приєднати AI-перекладач
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox id="transcript" checked={saveTranscript} onCheckedChange={(val) => setSaveTranscript(!!val)} />
                            <Label htmlFor="transcript" className="text-xs flex items-center gap-1.5 cursor-pointer">
                              <History className="h-3 w-3 text-primary" /> Зберегти транскрипт
                            </Label>
                          </div>
                        </div>
                      )}

                      <Button className={cn("w-full mt-auto font-bold", offer.type !== 'video' ? "bg-green-600 hover:bg-green-700 text-white" : "bg-primary text-primary-foreground")} disabled={isCalling || (offer.type === 'video' && !online)} onClick={() => offer.type === 'video' ? handleCallClick(offer.id) : handleOrderClick(offer)}>
                        {offer.type === 'video' ? <><Phone className="mr-2 h-4 w-4" /> Виклик</> : <><Send className="mr-2 h-4 w-4" /> Замовити</>}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-12 border border-dashed rounded-xl">Немає доступних миттєвих пропозицій.</p>
          )}
        </section>

        {/* Секція Публікацій */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold tracking-tight">Публікації</h2>
          {loadingPosts ? (
            <div className="flex gap-4"><Skeleton className="h-48 w-64 rounded-xl" /></div>
          ) : userPosts && userPosts.length > 0 ? (
            <Carousel opts={{ align: "start" }} className="w-full">
              <CarouselContent className="-ml-2 md:-ml-4">
                {userPosts.map((post) => (
                  <CarouselItem key={post.id} className="pl-2 md:pl-4 basis-[85%] sm:basis-[45%] lg:basis-[33%]">
                    <PostCard post={post} userId={id} />
                  </CarouselItem>
                ))}
              </CarouselContent>
            </Carousel>
          ) : (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center text-muted-foreground"><Layout className="h-8 w-8 opacity-20" /><p>У цього автора ще немає публікацій.</p></CardContent>
            </Card>
          )}
        </section>
      </div>

      <Dialog open={!!selectedOffer} onOpenChange={(open) => !open && setSelectedOffer(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Нове замовлення</DialogTitle><DialogDescription>Введіть ваше запитання нижче.</DialogDescription></DialogHeader>
          <div className="py-4"><Textarea placeholder="Ваше запитання..." className="min-h-[150px]" value={questionText} onChange={e => setQuestionText(e.target.value)} /></div>
          <DialogFooter className="flex gap-2"><Button variant="outline" className="flex-1" onClick={() => setSelectedOffer(null)}>Скасувати</Button><Button className="flex-1 bg-green-600 text-white" onClick={handleCreateRequest} disabled={!questionText.trim() || isOrdering}>{isOrdering ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Підтвердити'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Calendar Overlay */}
      {isCalendarOpen && (
        <Dialog open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
          <DialogContent className="sm:max-w-xl p-0 overflow-hidden">
            <DialogHeader className="sr-only">
              <DialogTitle>Календар подій</DialogTitle>
              <DialogDescription>Перегляд доступних сеансів для бронювання</DialogDescription>
            </DialogHeader>
            <CalendarView 
              userId={id} 
              onClose={() => setIsCalendarOpen(false)} 
              offers={scheduledOffers} 
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
