'use client';

import { ScrollArea } from '@/components/ui/scroll-area';
import type { TranslationSegmentDoc } from '@/lib/translation/types';
import { cn } from '@/lib/utils';
import { useEffect, useRef } from 'react';

interface TranslatedCaptionsPanelProps {
  segments: TranslationSegmentDoc[] | null;
  className?: string;
}

export function TranslatedCaptionsPanel({ segments, className }: TranslatedCaptionsPanelProps) {
  const viewportRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new segments arrive
  useEffect(() => {
    if (viewportRef.current) {
      const scrollContainer = viewportRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [segments]);

  if (!segments || segments.length === 0) {
    return (
      <div className={cn("flex items-center justify-center text-white/40 text-[10px] italic p-4 bg-black/60 rounded-xl border border-white/5", className)}>
        Очікування мовлення...
      </div>
    );
  }

  return (
    <div ref={viewportRef} className={cn("relative group", className)}>
      <ScrollArea className="h-full w-full bg-black/80 backdrop-blur-xl rounded-xl border border-white/10 shadow-2xl">
        <div className="p-4 space-y-4">
          {segments.slice(-20).map((segment, idx) => (
            <div 
              key={`${segment.speakerUid}-${segment.sequence}-${idx}`} 
              className={cn(
                "flex flex-col gap-1 transition-all duration-300 animate-in fade-in slide-in-from-bottom-1",
                !segment.isFinal && "opacity-70 scale-[0.98] origin-left"
              )}
            >
              <div className="flex items-center gap-2">
                <span className={cn(
                  "text-[8px] font-black uppercase px-1.5 py-0.5 rounded tracking-tighter",
                  segment.speakerRole === 'caller' ? "bg-primary text-primary-foreground" : "bg-green-500 text-white"
                )}>
                  {segment.speakerDisplayName || (segment.speakerRole === 'caller' ? 'Клієнт' : 'Профі')}
                </span>
                {!segment.isFinal && (
                  <span className="text-[8px] text-yellow-500 font-bold animate-pulse tracking-widest uppercase">
                    Запис...
                  </span>
                )}
              </div>
              
              <p className="text-sm font-medium text-white leading-snug">
                {segment.translatedText}
              </p>
              
              {segment.isFinal && (
                <p className="text-[10px] text-white/30 italic font-light line-clamp-1 group-hover:line-clamp-none transition-all">
                  {segment.originalText}
                </p>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
      <div className="absolute top-2 right-2 flex gap-1">
        <div className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
      </div>
    </div>
  );
}
