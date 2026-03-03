'use client';

import { useState } from 'react';
import { useUser, useFirestore, useDoc, useMemoFirebase, useFirebaseApp } from '@/firebase';
import { doc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type { UserProfile } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Wallet, ArrowUpRight, ArrowDownLeft, History, Loader2 } from 'lucide-react';
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
      <h1 className="mb-8 text-3xl font-bold tracking-tight">Aktive</h1>

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
          <div className="flex gap-3">
            <Button 
              variant="secondary" 
              className="flex-1 bg-white/20 hover:bg-white/30 border-none text-white"
              onClick={handleTopUp}
              disabled={isTopUpLoading}
            >
              {isTopUpLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ArrowDownLeft className="mr-2 h-4 w-4" />
              )}
              Поповнити
            </Button>
            <Button 
              variant="secondary" 
              className="flex-1 bg-white/20 hover:bg-white/30 border-none text-white opacity-50 cursor-not-allowed"
              disabled
            >
              <ArrowUpRight className="mr-2 h-4 w-4" /> Вивести
            </Button>
          </div>
        </CardContent>
      </Card>

      <Button 
        variant="outline" 
        size="lg"
        className="w-full h-16 justify-between px-6 text-lg font-semibold group border-primary/20 hover:border-primary hover:bg-primary/5 transition-all"
        onClick={() => router.push('/wallet/transactions')}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-full bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
            <History className="h-6 w-6" />
          </div>
          <span>Історія транзакцій</span>
        </div>
        <ArrowUpRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
      </Button>

      <div className="mt-12 text-center">
        <p className="text-sm text-muted-foreground">
          Тут ви можете керувати своїм балансом COIN для здійснення відеодзвінків та замовлення послуг.
        </p>
      </div>
    </div>
  );
}
