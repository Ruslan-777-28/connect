
'use client';

import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Video, FileText, Globe, Download, History as HistoryIcon, Calendar } from 'lucide-react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy } from 'firebase/firestore';
import type { Call } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

export default function HistoryPage() {
  const { user } = useUser();
  const firestore = useFirestore();

  const historyQuery = useMemoFirebase(
    () => (user ? query(
      collection(firestore, 'calls'),
      where('status', '==', 'ended'),
      orderBy('createdAtTs', 'desc')
    ) : null),
    [user?.uid, firestore]
  );

  const { data: calls, isLoading } = useCollection<Call>(historyQuery);

  // Filter calls where user was a participant
  const userCalls = (calls || []).filter(c => c.callerId === user?.uid || c.receiverId === user?.uid);

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8 pb-24">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-2 rounded-xl bg-primary/10 text-primary">
          <HistoryIcon className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Історія сесій</h1>
          <p className="text-sm text-muted-foreground">Архів ваших відеодзвінків та транскриптів.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary opacity-20" />
        </div>
      ) : userCalls.length > 0 ? (
        <div className="space-y-4">
          {userCalls.map((call) => (
            <VideoSessionCard key={call.id} call={call} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 text-center border border-dashed rounded-3xl bg-muted/20">
          <Video className="h-12 w-12 text-muted-foreground/20 mb-4" />
          <h3 className="text-lg font-semibold text-muted-foreground">Історія порожня</h3>
          <p className="text-sm text-muted-foreground/60 mt-1">Тут з'являться ваші завершені відеоконсультації.</p>
        </div>
      )}
    </div>
  );
}

function VideoSessionCard({ call }: { call: Call }) {
  const date = call.createdAtTs?.toDate?.() || new Date();
  
  return (
    <Card className="overflow-hidden border-primary/5 hover:border-primary/20 transition-all shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-2xl bg-muted flex items-center justify-center">
              <Video className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-bold text-base capitalize">
                  {call.type === 'video' ? 'Відеоконсультація' : 'Сесія'}
                </h3>
                {call.translationEnabled && (
                  <Badge variant="outline" className="h-5 px-1.5 rounded-full border-blue-500/20 text-blue-600 bg-blue-50 text-[9px] font-bold">
                    <Globe className="h-2.5 w-2.5 mr-1" /> LIVE TRANSLATION
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                </span>
                <span>•</span>
                <span>{call.billedMinutes || 0} хв</span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-black text-primary">{call.billedCoins || 0} COIN</p>
            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tighter opacity-50">Оплачено</p>
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-primary/5 flex items-center justify-between">
          <div className="flex gap-2">
            {call.transcriptGenerated ? (
              <Button variant="secondary" size="sm" className="h-8 rounded-full text-[11px] font-bold bg-green-50 text-green-700 hover:bg-green-100" asChild>
                <Link href={`/history/video/${call.id}/transcript`}>
                  <FileText className="h-3.5 w-3.5 mr-1.5" /> Переглянути транскрипт
                </Link>
              </Button>
            ) : call.transcriptEnabled ? (
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground italic font-medium px-3">
                <Loader2 className="h-3 w-3 animate-spin" /> Генерація протоколу...
              </div>
            ) : null}
          </div>
          
          <Button variant="ghost" size="sm" className="h-8 rounded-full text-[11px] font-bold text-muted-foreground" asChild>
            <Link href={`/history/video/${call.id}`}>Деталі сесії</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
