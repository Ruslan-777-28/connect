
'use client';

import { useState, useMemo } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Video, Clock, ChevronRight, CheckCircle2, Loader2, X } from 'lucide-react';
import type { CommunicationOffer } from '@/lib/types';
import { useUser, useFirebaseApp } from '@/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

interface CalendarViewProps {
  userId: string;
  onClose: () => void;
  offers: CommunicationOffer[];
}

export function CalendarView({ userId, onClose, offers }: CalendarViewProps) {
  const [date, setDate] = useState<Date | undefined>(new Date());
  const { user: currentUser } = useUser();
  const app = useFirebaseApp();
  const { toast } = useToast();
  const router = useRouter();
  const [isBooking, setIsBooking] = useState<string | null>(null);

  const offersForSelectedDate = useMemo(() => {
    if (!date || !offers) return [];
    const dateStr = date.toISOString().split('T')[0];
    return offers.filter(o => {
      const oDate = o.scheduledStart?.toDate?.()?.toISOString().split('T')[0];
      return oDate === dateStr;
    }).sort((a,b) => a.scheduledStart?.toMillis() - b.scheduledStart?.toMillis());
  }, [date, offers]);

  const handleBook = async (offer: CommunicationOffer) => {
    if (!currentUser) {
      router.push('/login');
      return;
    }
    
    setIsBooking(offer.id);
    try {
      const functions = getFunctions(app, 'us-central1');
      const createReq = httpsCallable(functions, 'createCommunicationRequest');
      await createReq({
        offerId: offer.id,
        type: 'video',
        questionText: `Booking scheduled call: ${offer.subcategoryId}`
      });
      toast({ title: 'Заброньовано!', description: 'Запит надіслано фахівцю.' });
      onClose();
      router.push('/wallet');
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Помилка', description: e.message });
    } finally {
      setIsBooking(null);
    }
  };

  // Days that have available offers
  const availableDays = useMemo(() => {
    if (!offers) return [];
    return offers.map(o => o.scheduledStart?.toDate?.());
  }, [offers]);

  return (
    <div className="flex flex-col h-[85vh] sm:h-auto">
      <div className="flex items-center justify-between p-4 border-b bg-background sticky top-0 z-10">
        <h2 className="text-lg font-bold">Календар подій</h2>
        <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>

      <div className="flex flex-col sm:flex-row flex-1 overflow-hidden">
        <div className="p-4 border-b sm:border-b-0 sm:border-r bg-muted/10">
          <Calendar
            mode="single"
            selected={date}
            onSelect={setDate}
            className="rounded-md border-none"
            modifiers={{ available: availableDays }}
            modifiersClassNames={{ available: "bg-primary/10 text-primary font-bold ring-1 ring-primary/20" }}
          />
        </div>

        <div className="flex-1 flex flex-col min-h-0 bg-background">
          <div className="p-4 border-b">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Доступні сеанси: {date?.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })}
            </h3>
          </div>

          <ScrollArea className="flex-1 p-4">
            {offersForSelectedDate.length > 0 ? (
              <div className="space-y-3">
                {offersForSelectedDate.map((offer) => (
                  <Card key={offer.id} className={cn("border-primary/5 transition-all", offer.status === 'booked' && "opacity-50")}>
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="rounded-full bg-primary/10 p-2 text-primary">
                          <Video className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-bold">
                            {offer.scheduledStart?.toDate()?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            {' - '}
                            {offer.scheduledEnd?.toDate()?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                          <p className="text-[10px] text-muted-foreground uppercase font-medium">
                            {offer.subcategoryId} • {offer.durationMinutes} хв
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-extrabold text-primary mb-1">{offer.pricing.ratePerSession} COIN</p>
                        <Button 
                          size="sm" 
                          className="h-7 px-3 text-[10px] font-bold rounded-full" 
                          disabled={offer.status === 'booked' || !!isBooking}
                          onClick={() => handleBook(offer)}
                        >
                          {isBooking === offer.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 
                           offer.status === 'booked' ? 'Зайнято' : 'Замовити'}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CalendarIcon className="h-12 w-12 text-muted-foreground/20 mb-4" />
                <p className="text-sm text-muted-foreground">На цей день немає запланованих подій.</p>
              </div>
            )}
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
