'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';

export default function CallPage({ params }: { params: { callId: string } }) {
  const router = useRouter();

  useEffect(() => {
    const callId = params.callId;

    const token = sessionStorage.getItem(`dailyToken:${callId}`);
    const roomUrl = sessionStorage.getItem(`dailyRoomUrl:${callId}`);

    if (token && roomUrl) {
      // If we have a token from starting/accepting a call, redirect immediately.
      const url = new URL(roomUrl);
      url.searchParams.set('t', token);
      window.location.href = url.toString();
    } else {
      // If there's no token, it might be that the call ended,
      // or the user is trying to access the URL directly.
      // We can redirect them home or show a message.
      // For now, let's redirect home after a short delay.
      const timer = setTimeout(() => {
        router.push('/');
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [params.callId, router]);

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-4 p-6">
      <div className="text-lg font-medium">Connecting to call...</div>
      <p className="text-sm text-muted-foreground">
        You will be redirected shortly.
      </p>
      <div className="w-full max-w-md space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-10 w-24" />
      </div>
    </div>
  );
}
