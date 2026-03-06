'use client';

import { useState, useMemo } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Video, Clock, User, ArrowRight, Calendar as CalendarIcon, Loader2, Info } from 'lucide-react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy } from 'firebase/firestore';
import type { CommunicationOffer, CommunicationRequest } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

export default function EventsPage() {
  const [date, setDate] = useState<Date | undefined>(new Date());
  const { user } = useUser();
  const firestore = useFirestore();

  // 1. My created scheduled offers (as pro)
  const myOffersQuery = useMemoFirebase(
    () => (user?.uid ? query(
      collection(firestore, 'communicationOffers'),
      where('ownerId', '==', user.uid),
      where('schedulingType', '==', 'scheduled'),
      orderBy('scheduledStart', 'asc')
    ) : null),
    [user?.uid, firestore]
  );

  // 2. My booked requests (as client)
  const myBookingsQuery = useMemoFirebase(
    () => (user?.uid ? query(
      collection(firestore, 'communicationRequests'),
      where('initiatorId', '==', user.uid),
      where('type', '==', 'video'),
      orderBy('createdAt', 'desc')
    ) : null),
    [user?.uid, firestore]
  );

  const { data: myOffers, isLoading: loadingOffers } = useCollection<CommunicationOffer>(myOffersQuery);
  const { data: myBookings, isLoading: loadingBookings } = useCollection<CommunicationRequest>(myBookingsQuery);

  const selectedDateStr = date?.toISOString().split('T')[0];

  const dailyEvents = useMemo(() => {
    const events: any[] = [];
    
    // Add my offers
    myOffers?.forEach(o => {
      const oDate = o.scheduledStart?.toDate?.()?.toISOString().split('T')[0];
      if (oDate === selectedDateStr) {
        events.push({ ...o, eventType: 'my_slot' });
      }
    });

    // Add my bookings (we need to find the original offer to know the time)
    // For MVP, we only show my slots. To show booked external calls, we'd need more data joins.
    
    return events.sort((a,b) => a.scheduledStart?.toMillis() - b.scheduledStart?.toMillis());
  }, [myOffers, selectedDateStr]);

  const allEventDates = useMemo(() => {
    return (myOffers || []).map(o => o.scheduledStart?.toDate?.());
  }, [myOffers]);

  if (!user) {
    return (
      <div className="container mx-auto p-12 text-center">
        <h1 className="text-2xl font-bold mb-4">Ivent</h1>
        <p className="text-muted-foreground">Будь ласка, увійдіть, щоб переглянути свій календар.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8 pb-24">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Ivent</h1>
          <p className="text-muted-foreground mt-1">Ваш персональний розклад та записи.</p>
        </div>
        <Badge variant="outline" className="h-8 px-4 rounded-full border-primary/20 text-primary">
          {myOffers?.length || 0} ПОДІЙ
        </Badge>
      </div>

      <div className="grid gap-8 md:grid-cols-[350px_1fr]">
        <aside className="space-y-6">
          <Card className="border-primary/5 shadow-sm">
            <CardContent className="p-4 flex justify-center">
              <Calendar
                mode="single"
                selected={date}
                onSelect={setDate}
                className="rounded-md"
                modifiers={{ event: allEventDates }}
                modifiersClassNames={{ event: "bg-primary/10 text-primary font-bold ring-1 ring-primary/20" }}
              />
            </CardContent>
          </Card>

          <Card className="bg-primary/5 border-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-primary/60 flex items-center gap-2">
                <Info className="h-3 w-3" /> Порада
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-[11px] text-primary/80 leading-relaxed">
                Створюйте заплановані відеозустрічі через кнопку <b>Create &gt; Комунікація</b>. Вони автоматично з&apos;являться тут і будуть доступні клієнтам у вашому профілі.
              </p>
            </CardContent>
          </Card>
        </aside>

        <main className="flex flex-col min-h-0">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold flex items-center gap-2">
              {date?.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })}
            </h2>
          </div>

          <ScrollArea className="h-[500px] rounded-xl border p-4 bg-muted/10 shadow-inner">
            {loadingOffers ? (
              <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary/30" /></div>
            ) : dailyEvents.length > 0 ? (
              <div className="space-y-4">
                {dailyEvents.map((event) => (
                  <Card key={event.id} className="border-none shadow-sm group hover:ring-1 hover:ring-primary/20 transition-all">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-primary/10 flex flex-col items-center justify-center text-primary">
                          <span className="text-xs font-bold leading-none">
                            {event.scheduledStart?.toDate()?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-bold text-sm">{event.subcategoryId}</span>
                            <Badge className="h-4 text-[8px] px-1 capitalize" variant={event.status === 'booked' ? 'default' : 'secondary'}>
                              {event.status === 'booked' ? 'Заброньовано' : 'Вільний слот'}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 text-[10px] text-muted-foreground font-medium uppercase">
                            <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {event.durationMinutes} хв</span>
                            <span className="flex items-center gap-1"><Video className="h-3 w-3" /> Відеочат</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-extrabold text-primary">{event.pricing.ratePerSession} COIN</p>
                        <p className="text-[9px] text-muted-foreground italic">
                          {event.status === 'booked' ? 'Очікує оплати' : 'Чекає замовника'}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center opacity-40">
                <CalendarIcon className="h-16 w-16 mb-4" />
                <p className="text-sm font-medium">На цей день подій не заплановано</p>
              </div>
            )}
          </ScrollArea>
        </main>
      </div>
    </div>
  );
}
