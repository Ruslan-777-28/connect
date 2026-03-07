'use client';

import { Badge } from '@/components/ui/badge';
import { Loader2, Globe } from 'lucide-react';
import type { TranslationStatus } from '@/lib/translation/types';

interface TranslationStatusBadgeProps {
  status: TranslationStatus;
}

export function TranslationStatusBadge({ status }: TranslationStatusBadgeProps) {
  const getVariant = () => {
    switch (status) {
      case 'active': return 'default';
      case 'starting': return 'secondary';
      case 'error': return 'destructive';
      default: return 'outline';
    }
  };

  const getLabel = () => {
    switch (status) {
      case 'starting': return 'Підключення перекладача...';
      case 'active': return 'Live Переклад';
      case 'error': return 'Помилка перекладу';
      case 'ended': return 'Переклад завершено';
      default: return 'Переклад вимкнено';
    }
  };

  if (status === 'idle') return null;

  return (
    <Badge variant={getVariant()} className="flex items-center gap-1.5 px-3 py-1 shadow-sm">
      {status === 'starting' ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Globe className="h-3 w-3" />
      )}
      <span className="text-[10px] font-bold uppercase tracking-wider">{getLabel()}</span>
    </Badge>
  );
}
