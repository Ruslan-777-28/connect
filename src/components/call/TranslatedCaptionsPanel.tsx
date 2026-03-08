
'use client';

import { ScrollArea } from '@/components/ui/scroll-area';
import type { TranslationSegmentDoc } from '@/lib/translation/types';
import { cn } from '@/lib/utils';
import { useEffect, useRef } from 'react';

interface TranslatedCaptionsPanelProps {
  segments: TranslationSegmentDoc[] | null;
  localPreview?: string;
  className?: string;
}

export function TranslatedCaptionsPanel({ segments, localPreview, className }: TranslatedCaptionsPanelProps) {
  const viewportRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new segments arrive or local preview updates
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
        <div className="p-4 space-y-5">
          {segments?.slice(-30).map((segment, idx) => (
            <div 
              key={`${segment.speakerUid}-${segment.sequence}-${idx}`} 
              className={cn(
                "flex flex-col gap-1.5 transition-all duration-300 animate-in fade-in slide-in-from-bottom-2",
                !segment.isFinal && "opacity-70 scale-[0.98] origin-left"
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "text-[8px] font-black uppercase px-1.5 py-0.5 rounded tracking-widest leading-none",
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
                <span className="text-[7px] text-white/20 font-mono uppercase tracking-tighter">
                  {segment.sourceLocale} → {segment.targetLocale}
                </span>
              </div>
              
              {/* Main Translation */}
              <p className="text-sm font-bold text-white leading-relaxed">
                {segment.translatedText}
              </p>
              
              {/* Original Text (Secondary) */}
              {segment.isFinal && (
                <p className="text-[11px] text-white/40 italic font-medium border-l-2 border-white/10 pl-2 py-0.5">
                  {segment.originalText}
                </p>
              )}
            </div>
          ))}

          {/* Local Preview (My ongoing speech) */}
          {localPreview && (
            <div className="flex flex-col gap-1.5 opacity-60 scale-[0.98] origin-left animate-in fade-in slide-in-from-bottom-1">
              <div className="flex items-center gap-2">
                <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded tracking-widest leading-none bg-white/20 text-white">
                  Ви
                </span>
                <span className="text-[8px] text-yellow-500 font-bold animate-pulse tracking-widest uppercase">
                  Розпізнавання...
                </span>
              </div>
              <p className="text-sm font-medium text-white leading-relaxed italic border-l-2 border-yellow-500/30 pl-2">
                {localPreview}
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
      
      {/* Live Indicator */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5">
        <span className="text-[7px] font-black text-red-500 uppercase tracking-widest">Live</span>
        <div className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
      </div>
    </div>
  );
}
