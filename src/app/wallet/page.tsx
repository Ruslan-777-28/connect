
'use client';

import { useState } from 'react';
import { useUser, useFirestore, useDoc, useMemoFirebase, useFirebaseApp, useCollection } from '@/firebase';
import { doc, collection, query, where, orderBy } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type { UserProfile, WalletLedgerEntry } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Wallet, ArrowUpRight, ArrowDownLeft, History, Loader2, ArrowRightLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export default function WalletPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const app = useFirebaseApp();
  const { toast } = useToast();

  const [isTopUpLoading, setIsTopUpLoading] = useState(false);

  // Profile data
  const userDocRef = useMemoFirebase(
    () => (user ? doc(firestore, 'users', user.uid) : null),
    [user, firestore]
  );
  const { data: profile, isLoading: isProfileLoading } = useDoc<UserProfile>(userDocRef);

  // Ledger history query
  const ledgerQuery = useMemoFirebase(
    () => (user ? query(
      collection(firestore, 'walletLedger'),
      where('uid', '==', user.uid),
      orderBy('createdAt', 'desc')
    ) : null),
    [user, firestore]
  );
  const { data: ledger, isLoading: isLedgerLoading } = useCollection<WalletLedgerEntry>(ledgerQuery);

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

      <Card className="bg-primary text-primary-foreground overflow-hidden border-none shadow-xl">
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

      <section className="mt-12 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            Історія транзакцій
          </h2>
        </div>

        {isLedgerLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : ledger && ledger.length > 0 ? (
          <div className="space-y-3">
            {ledger.map((entry) => (
              <Card key={entry.id} className="overflow-hidden">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "p-2 rounded-full",
                      entry.amount > 0 ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
                    )}>
                      {entry.type === 'topup' && <ArrowDownLeft className="h-4 w-4" />}
                      {entry.type === 'call_payment' && <ArrowUpRight className="h-4 w-4" />}
                      {entry.type === 'payout' && <ArrowDownLeft className="h-4 w-4" />}
                      {entry.kind === 'call_prepay' && <ArrowRightLeft className="h-4 w-4" />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold capitalize">
                        {entry.kind ? entry.kind.replace('_', ' ') : entry.type}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {entry.createdAt?.toDate ? entry.createdAt.toDate().toLocaleString() : 'Just now'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={cn(
                      "font-bold",
                      entry.amount > 0 ? "text-green-600" : "text-red-600"
                    )}>
                      {entry.amount > 0 ? '+' : ''}{entry.amount} {entry.currency}
                    </p>
                    <Badge variant="outline" className="text-[10px] h-4">
                      {entry.status}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center text-muted-foreground flex flex-col items-center gap-2">
              <History className="h-12 w-12 opacity-20" />
              <p>У вас поки немає транзакцій.</p>
              <p className="text-xs">Тут з'являться дані про ваші дзвінки та поповнення.</p>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
