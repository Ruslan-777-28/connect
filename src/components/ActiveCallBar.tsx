'use client';

import { respondToCallAction } from '@/lib/actions';
import type { Call } from '@/lib/types';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { UserAvatar } from './user-avatar';
import { PhoneOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ActiveCallBarProps {
  call: Call;
}

export function ActiveCallBar({ call }: ActiveCallBarProps) {
  const { toast } = useToast();

  const handleEndCall = async () => {
    try {
      await respondToCallAction(call.id, 'end');
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to end call.',
      });
    }
  };

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50">
      <Card className="p-3 shadow-lg">
        <div className="flex items-center gap-4">
          {call.caller && <UserAvatar user={call.caller} />}
          <div className="font-medium">
            Call with {call.caller?.name || '...'}
          </div>
          <Button size="icon" variant="destructive" onClick={handleEndCall}>
            <PhoneOff className="h-4 w-4" />
          </Button>
        </div>
      </Card>
    </div>
  );
}
