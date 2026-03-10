'use client';

import { ScrollArea } from '@/components/ui/scroll-area';
import type { TranslationSegmentDoc } from '@/lib/translation/types';
import { cn } from '@/lib/utils';
import { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import type { UserProfile } from '@/lib/types';

interface TranslatedCaptionsPanelProps {
  segments: TranslationSegmentDoc[] | null;
  localPreview?: string;
  className?: string;
}

export function TranslatedCaptionsPanel({ segments, localPreview, className }: TranslatedCaptionsPanelProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  
  const { user } = useUser();
  const firestore = useFirestore();

  const userRef = useMemoFirebase(() => (user ? doc(firestore, 'users', user.uid) : null), [user, firestore]);
  const { data: profile } = useDoc<UserProfile>(userRef);
  const myLocale = profile?.preferredLanguage || 'uk-UA';

  useEffect(() => {
    if (viewportRef.current) {
      const scrollContainer = viewportRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [segments, localPreview]);

  const hasContent = (segments && segments.length > 0) || !!localPreview;

  if (!hasContent) {
    return (
      <div className={cn("flex items-center justify-center text-white/40 text-[10px] italic p-4 bg-black/60 rounded-xl border border-white/5", className)}>
        Очікування мовлення...
      </div>
    );
  }

  return (
    <div ref={viewportRef} className={cn("relative group h-full", className)}>
      <ScrollArea className="h-full w-full bg-black/80 backdrop-blur-xl rounded-xl border border-white/10 shadow-2xl overflow-hidden">
        <div className="p-3 md:p-4 space-y-3 md:space-y-5">
          {segments?.map((segment, idx) => {
            const displayTranslation =
              segment.translations?.[myLocale] ||
              segment.translations?.[Object.keys(segment.translations || {})[0]] ||
              null;

            const isPending = !displayTranslation;
            
            return (
              <div 
                key={`${segment.speakerUid}-${segment.sequence}-${idx}`} 
                className={cn(
                  "flex flex-col gap-1 md:gap-1.5 transition-all duration-300 animate-in fade-in slide-in-from-bottom-2",
                  isPending && "opacity-80"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "text-[7px] md:text-[8px] font-black uppercase px-1.5 py-0.5 rounded tracking-widest leading-none",
                      segment.speakerRole === 'caller' ? "bg-primary text-primary-foreground" : "bg-green-500 text-white"
                    )}>
                      {segment.speakerDisplayName || (segment.speakerRole === 'caller' ? 'Клієнт' : 'Профі')}
                    </span>
                    {isPending && (
                      <span className="flex items-center gap-1 text-[7px] text-primary animate-pulse font-bold uppercase tracking-tighter">
                        <Loader2 className="h-2 w-2 animate-spin" /> Переклад...
                      </span>
                    )}
                  </div>
                  <span className="text-[7px] text-white/20 font-mono uppercase tracking-tighter">
                    {segment.sourceLocale} → {myLocale}
                  </span>
                </div>
                
                <p className={cn(
                  "text-xs md:text-sm leading-relaxed transition-colors duration-500",
                  isPending ? "text-white font-medium italic" : "text-white font-bold"
                )}>
                  {isPending ? segment.originalText : displayTranslation}
                </p>
                
                {!isPending && (
                  <p className="text-[10px] md:text-[11px] text-white/40 italic font-medium border-l-2 border-white/10 pl-2 py-0.5">
                    {segment.originalText}
                  </p>
                )}
              </div>
            );
          })}

          {localPreview && (
            <div className="flex flex-col gap-1 md:gap-1.5 opacity-60 scale-[0.98] origin-left animate-in fade-in slide-in-from-bottom-1">
              <div className="flex items-center gap-2">
                <span className="text-[7px] md:text-[8px] font-black uppercase px-1.5 py-0.5 rounded tracking-widest leading-none bg-white/20 text-white">
                  Ви
                </span>
                <span className="text-[7px] md:text-[8px] text-yellow-500 font-bold animate-pulse tracking-widest uppercase">
                  Розпізнавання...
                </span>
              </div>
              <p className="text-xs md:text-sm font-medium text-white leading-relaxed italic border-l-2 border-yellow-500/30 pl-2">
                {localPreview}
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
      
      <div className="absolute top-2 right-2 md:top-3 md:right-3 flex items-center gap-1.5">
        <span className="text-[7px] font-black text-red-500 uppercase tracking-widest">Live</span>
        <div className="h-1 w-1 md:h-1.5 md:w-1.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
      </div>
    </div>
  );
}
