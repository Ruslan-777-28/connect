
'use client';

import { useParams, useRouter } from 'next/navigation';
import { useDoc, useFirestore, useMemoFirebase, useCollection, useUser } from '@/firebase';
import { doc, collection, query, orderBy } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, Download, FileText, Loader2, Globe, Clock } from 'lucide-react';
import type { Call, TranslationSegment, UserProfile } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export default function TranscriptPage() {
  const { callId } = useParams<{ callId: string }>();
  const router = useRouter();
  const firestore = useFirestore();
  const { user } = useUser();

  const userRef = useMemoFirebase(() => (user ? doc(firestore, 'users', user.uid) : null), [user, firestore]);
  const { data: profile } = useDoc<UserProfile>(userRef);
  const myLocale = profile?.preferredLanguage || 'uk-UA';

  const callRef = useMemoFirebase(() => doc(firestore, 'calls', callId), [firestore, callId]);
  const { data: call, isLoading: loadingCall } = useDoc<Call>(callRef);

  const segmentsQuery = useMemoFirebase(
    () => (callId ? query(
      collection(firestore, 'callTranslations', callId, 'segments'),
      orderBy('sequence', 'asc')
    ) : null),
    [firestore, callId]
  );
  const { data: segments, isLoading: loadingSegments } = useCollection<TranslationSegment>(segmentsQuery);

  const handleDownload = () => {
    if (!call?.transcriptUrl) return;
    window.open(call.transcriptUrl, '_blank');
  };

  if (loadingCall || loadingSegments) {
    return (
      <div className="container mx-auto max-w-3xl py-24 flex flex-col items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
        <p className="mt-4 text-muted-foreground font-medium animate-pulse">Завантаження протоколу розмови...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8 pb-32">
      <div className="flex items-center justify-between mb-8">
        <Button variant="ghost" className="-ml-2 text-muted-foreground" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Назад
        </Button>
        {call?.transcriptUrl && (
          <Button variant="outline" size="sm" className="rounded-full font-bold text-primary shadow-sm" onClick={handleDownload}>
            <Download className="h-4 w-4 mr-2" /> Завантажити .TXT
          </Button>
        )}
      </div>

      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-xl bg-primary/10">
            <FileText className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-black tracking-tight">Транскрипт сесії</h1>
        </div>
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Globe className="h-3.5 w-3.5 text-primary" /> 
          Повний протокол розмови з використанням AI-перекладача (Оригінал + Переклад).
        </p>
      </div>

      <Card className="border-primary/5 shadow-xl overflow-hidden rounded-3xl bg-card">
        <CardContent className="p-0">
          <ScrollArea className="h-[65vh]">
            <div className="p-6 space-y-8">
              {segments && segments.length > 0 ? (
                segments.map((seg) => {
                  const time = seg.emittedAt?.toDate?.()?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || '--:--';
                  const displayTranslation = seg.translations?.[myLocale] || seg.translations?.[Object.keys(seg.translations)[0]] || '';
                  
                  return (
                    <div key={seg.id} className="group animate-in fade-in slide-in-from-bottom-2 duration-500">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            "h-6 px-2 rounded flex items-center justify-center text-[10px] font-black uppercase tracking-widest",
                            seg.speakerRole === 'caller' ? "bg-primary text-primary-foreground" : "bg-green-600 text-white"
                          )}>
                            {seg.speakerDisplayName || (seg.speakerRole === 'caller' ? 'Клієнт' : 'Експерт')}
                          </div>
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
                            <Clock className="h-2.5 w-2.5" />
                            {time}
                          </div>
                        </div>
                        <span className="text-[10px] text-muted-foreground/40 uppercase font-bold tracking-tighter">
                          {seg.sourceLocale} → {myLocale}
                        </span>
                      </div>
                      
                      <div className="pl-4 border-l-2 border-primary/20 space-y-2">
                        <div className="space-y-1">
                          <span className="text-[9px] font-bold text-primary uppercase tracking-widest opacity-70">Переклад:</span>
                          <p className="text-sm font-bold text-foreground leading-relaxed">
                            {displayTranslation}
                          </p>
                        </div>
                        <div className="space-y-1 pt-1">
                          <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest opacity-70">Оригінал:</span>
                          <p className="text-xs text-muted-foreground leading-relaxed italic">
                            {seg.originalText}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-20 text-muted-foreground italic flex flex-col items-center gap-2 opacity-40">
                  <FileText className="h-12 w-12" />
                  Дані про розмову відсутні або ще не оброблені.
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
      
      <div className="mt-8 p-5 rounded-2xl bg-primary/5 border border-primary/10 flex items-start gap-4">
        <div className="p-2 rounded-full bg-primary/10 text-primary shrink-0">
          <Globe className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <h4 className="text-xs font-bold text-primary uppercase tracking-wider">Про цей документ</h4>
          <p className="text-[11px] text-primary/70 leading-relaxed italic">
            Цей транскрипт згенеровано автоматично AI-перекладачем. Текст відображає розпізнане мовлення в реальному часі та може містити неточності, зумовлені якістю аудіосигналу або специфікою акценту.
          </p>
        </div>
      </div>
    </div>
  );
}
