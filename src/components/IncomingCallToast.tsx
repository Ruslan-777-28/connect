'use client';

import { respondToCallAction } from '@/lib/actions';
import type { Call } from '@/lib/types';
import { Button } from './ui/button';
import { Toast, ToastDescription, ToastTitle } from './ui/toast';
import { UserAvatar } from './user-avatar';
import { Phone, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface IncomingCallToastProps {
  call: Call;
}

export function IncomingCallToast({ call }: IncomingCallToastProps) {
  const { toast } = useToast();

  const handleAccept = async () => {
    try {
      await respondToCallAction(call.id, 'accept');
    } catch (error: any) {
       toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to accept call.',
      });
    }
  };

  const handleDecline = async () => {
    try {
      await respondToCallAction(call.id, 'decline');
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to decline call.',
      });
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-50">
        <Toast className="w-full max-w-sm p-4">
             <div className="flex items-center gap-4">
                {call.caller && <UserAvatar user={call.caller} />}
                <div className="flex-1">
                    <ToastTitle>Incoming Call</ToastTitle>
                    <ToastDescription>{call.caller?.name || 'Someone'} is calling...</ToastDescription>
                </div>
                <div className="flex gap-2">
                    <Button size="icon" variant="destructive" onClick={handleDecline}>
                        <X className="h-4 w-4" />
                    </Button>
                    <Button size="icon" className="bg-green-500 hover:bg-green-600" onClick={handleAccept}>
                        <Phone className="h-4 w-4" />
                    </Button>
                </div>
             </div>
        </Toast>
    </div>
  );
}
