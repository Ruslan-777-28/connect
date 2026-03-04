
'use client';

import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Video, FileText, HelpCircle } from 'lucide-react';

interface CommunicationTypeModalProps {
  open: boolean;
  onClose: () => void;
  onPick: (type: 'video' | 'file' | 'text') => void;
}

export function CommunicationTypeModal({
  open,
  onClose,
  onPick,
}: CommunicationTypeModalProps) {
  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Обери тип комунікації</DialogTitle>
          <DialogDescription>
            Виберіть формат, у якому ви хочете надавати послуги.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-3 py-4">
          <Button 
            variant="outline" 
            className="flex h-auto flex-col items-start gap-1 p-4 text-left"
            onClick={() => onPick('video')}
          >
            <div className="flex items-center gap-2 font-semibold">
              <Video className="h-4 w-4" />
              Відеочат
            </div>
            <span className="text-xs text-muted-foreground font-normal">Ціна за хвилину розмови</span>
          </Button>

          <Button 
            variant="outline" 
            className="flex h-auto flex-col items-start gap-1 p-4 text-left"
            onClick={() => onPick('file')}
          >
            <div className="flex items-center gap-2 font-semibold">
              <FileText className="h-4 w-4" />
              Файл + повідомлення
            </div>
            <span className="text-xs text-muted-foreground font-normal">Ціна за один файл</span>
          </Button>

          <Button 
            variant="outline" 
            className="flex h-auto flex-col items-start gap-1 p-4 text-left"
            onClick={() => onPick('text')}
          >
            <div className="flex items-center gap-2 font-semibold">
              <HelpCircle className="h-4 w-4" />
              1 питання — 1 відповідь
            </div>
            <span className="text-xs text-muted-foreground font-normal">Ціна за одне запитання</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
