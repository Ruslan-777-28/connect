'use client';

import { useState } from 'react';
import { useUser, useFirestore, useDoc, useMemoFirebase, useFirebaseApp } from '@/firebase';
import { doc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type { UserProfile } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Wallet, ArrowUpRight, ArrowDownLeft, History, Loader2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

export default function WalletPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const app = useFirebaseApp();
  const router = useRouter();
  const { toast } = useToast();

  const [isTopUpLoading, setIsTopUpLoading] = useState(false);

  // Profile data
  const userDocRef = useMemoFirebase(
    () => (user ? doc(firestore, 'users', user.uid) : null),
    [user, firestore]
  );
  const { data: profile, isLoading: isProfileLoading } = useDoc<UserProfile>(userDocRef);

  const handleTopUp = async () => {
    if (!user) return;
    setIsTopUpLoading(true);
    try {
      const functions = getFunctions(app, 'us-central1');
      const devTopUp = httpsCallable(functions, 'devTopUp');
      const result: any = await devTopUp({ amount: 100 });
      
      if (result.data?.ok) {
        toast({
          title: 'Успіх!',
          description: 'Ваш баланс поповнено на 100 COIN.',
        });
      }
    } catch (error: any) {
      console.error('Top-up error:', error);
      toast({
        variant: 'destructive',
        title: 'Помилка',
        description: error.message || 'Не вдалося поповнити баланс.',
      });
    } finally {
      setIsTopUpLoading(false);
    }
  };

  if (isProfileLoading) {
    return (
      <div className="container mx-auto max-w-2xl p-4 py-8">
        <Skeleton className="h-48 w-full rounded-2xl" />
        <div className="mt-8 space-y-4">
          <Skeleton className="h-12 w-32" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  const balance = profile?.balance ?? 0;
  const currency = profile?.currency || 'COIN';

  return (
    <div className="container mx-auto max-w-2xl p-4 py-8 pb-24">
      <h1 className="mb-8 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
        Aktive
      </h1>

      <Card className="bg-primary text-primary-foreground overflow-hidden border-none shadow-xl mb-6">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium opacity-80 uppercase tracking-wider">Баланс</span>
            <Wallet className="h-5 w-5 opacity-80" />
          </div>
          <CardTitle className="text-4xl font-extrabold flex items-baseline gap-2">
            {balance.toFixed(0)} 
            <span className="text-xl font-medium opacity-80">{currency}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-3 gap-2">
            <Button 
              variant="secondary" 
              className="bg-white/20 hover:bg-white/30 border-none text-white px-2 py-6 flex flex-col gap-1 h-auto"
              onClick={handleTopUp}
              disabled={isTopUpLoading}
            >
              {isTopUpLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowDownLeft className="h-4 w-4" />
              )}
              <span className="text-[10px] uppercase font-bold text-center">Поповнити</span>
            </Button>

            <Button 
              variant="secondary" 
              className="bg-white/20 hover:bg-white/30 border-none text-white px-2 py-6 flex flex-col gap-1 h-auto"
              onClick={() => router.push('/wallet/transactions')}
            >
              <History className="h-4 w-4" />
              <span className="text-[10px] uppercase font-bold text-center">Транзакції</span>
            </Button>
            
            <Button 
              variant="secondary" 
              className="bg-white/20 hover:bg-white/30 border-none text-white px-2 py-6 flex flex-col gap-1 h-auto opacity-50 cursor-not-allowed"
              disabled
            >
              <ArrowUpRight className="h-4 w-4" />
              <span className="text-[10px] uppercase font-bold text-center">Вивести</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* New card for debts and pending actions */}
      <Card className="mb-8 border-primary/10 shadow-sm">
        <CardContent className="p-4 grid grid-cols-3 gap-2">
          <Button 
            variant="outline" 
            className="flex flex-col items-center gap-1 h-auto py-4 border-dashed"
          >
            <ArrowUpRight className="h-4 w-4 text-destructive" />
            <span className="text-[10px] uppercase font-bold text-center">Я винен</span>
          </Button>

          <Button 
            variant="outline" 
            className="flex flex-col items-center gap-1 h-auto py-4 border-dashed"
          >
            <Clock className="h-4 w-4 text-primary" />
            <span className="text-[10px] uppercase font-bold text-center">На розгляді</span>
          </Button>

          <Button 
            variant="outline" 
            className="flex flex-col items-center gap-1 h-auto py-4 border-dashed"
          >
            <ArrowDownLeft className="h-4 w-4 text-green-600" />
            <span className="text-[10px] uppercase font-bold text-center">Мені винні</span>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
