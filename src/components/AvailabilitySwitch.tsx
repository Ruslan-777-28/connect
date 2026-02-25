'use client';

import { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useFirestore, useUser } from '@/firebase';
import { doc, Timestamp, updateDoc } from 'firebase/firestore';
import type { Availability } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { cn } from '@/lib/utils';

interface AvailabilitySwitchProps {
  initialAvailability: Availability | null;
  className?: string;
  labelClassName?: string;
}

export function AvailabilitySwitch({
  initialAvailability,
  className,
  labelClassName,
}: AvailabilitySwitchProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  if (!user) {
    return null;
  }

  const handleToggle = async (checked: boolean) => {
    if (!user) return;
    setIsSaving(true);

    const newStatus = checked ? 'online' : 'offline';
    const data: { availability: Availability } = {
      availability: { status: newStatus },
    };

    if (newStatus === 'online') {
      const until = Timestamp.fromMillis(Date.now() + 2 * 60 * 60 * 1000);
      data.availability.until = until;
    }

    const userDocRef = doc(firestore, 'users', user.uid);
    try {
      await updateDoc(userDocRef, data);
      toast({
        title: 'Availability Updated',
        description: `You are now ${newStatus}.`,
      });
    } catch (e) {
      errorEmitter.emit(
        'permission-error',
        new FirestorePermissionError({
          path: userDocRef.path,
          operation: 'update',
          requestResourceData: data,
        })
      );
    } finally {
      setIsSaving(false);
    }
  };

  const isChecked = initialAvailability?.status === 'online';
  const labelText = isChecked ? 'Available now' : 'By appointment only';

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {isSaving ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Switch
          id="availability-mode"
          checked={isChecked}
          onCheckedChange={handleToggle}
          disabled={isSaving}
          aria-label="Availability for calls"
        />
      )}
      <Label
        htmlFor="availability-mode"
        className={cn('text-sm font-medium', labelClassName)}
      >
        {labelText}
      </Label>
    </div>
  );
}
