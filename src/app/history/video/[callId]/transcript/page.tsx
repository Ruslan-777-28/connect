
'use client';

import { useParams, useRouter } from 'next/navigation';
import { useDoc, useFirestore, useMemoFirebase, useCollection } from '@/firebase';
import { doc, collection, query, orderBy } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Download, FileText, Loader2, Globe, User } from 'lucide-react';
import type { Call, TranslationSegment } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export default function TranscriptPage() {
  const { callId } = useParams<{ callId: string }>();
  const router = useRouter();
  const firestore = useFirestore();

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
          <Button variant="outline" size="sm" className="rounded-full font-bold text-primary" onClick={handleDownload}>
            <Download className="h-4 w-4 mr-2" /> Завантажити .TXT
          </Button>
        )}
      </div>

      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <FileText className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-black tracking-tight">Транскрипт сесії</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Повний запит розмови з використанням AI-перекладача.
        </p>
      </div>

      <Card className="border-primary/5 shadow-xl overflow-hidden rounded-3xl">
        <CardContent className="p-0">
          <ScrollArea className="h-[65vh]">
            <div className="p-6 space-y-8">
              {segments && segments.length > 0 ? (
                segments.map((seg) => (
                  <div key={seg.id} className="group animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "h-6 px-2 rounded flex items-center justify-center text-[10px] font-black uppercase tracking-widest",
                          seg.speakerRole === 'caller' ? "bg-primary text-primary-foreground" : "bg-green-600 text-white"
                        )}>
                          {seg.speakerDisplayName || (seg.speakerRole === 'caller' ? 'Клієнт' : 'Експерт')}
                        </div>
                        <span className="text-[10px] text-muted-foreground font-mono opacity-40">#{seg.sequence}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground/40 uppercase font-bold tracking-tighter">
                        {seg.sourceLocale} → {seg.targetLocale}
                      </span>
                    </div>
                    
                    <div className="pl-3 border-l-2 border-primary/10">
                      <p className="text-sm font-bold text-foreground leading-relaxed mb-1.5">
                        {seg.translatedText}
                      </p>
                      <p className="text-xs text-muted-foreground leading-relaxed italic opacity-60">
                        {seg.originalText}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-20 text-muted-foreground italic">
                  Дані про розмову відсутні.
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
      
      <div className="mt-8 p-4 rounded-2xl bg-primary/5 border border-primary/10 flex items-start gap-3">
        <Globe className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <p className="text-[11px] text-primary/70 leading-relaxed italic">
          Цей транскрипт згенеровано автоматично AI-перекладачем. Текст може містити неточності, пов'язані з якістю вихідного аудіо-потоку.
        </p>
      </div>
    </div>
  );
}
