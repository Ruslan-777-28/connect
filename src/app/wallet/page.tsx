
'use client';

import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import type { UserProfile } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Wallet, ArrowUpRight, ArrowDownLeft, History } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function WalletPage() {
  const { user } = useUser();
  const firestore = useFirestore();

  const userDocRef = useMemoFirebase(
    () => (user ? doc(firestore, 'users', user.uid) : null),
    [user, firestore]
  );
  
  const { data: profile, isLoading } = useDoc<UserProfile>(userDocRef);

  if (isLoading) {
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

  return (
    <div className="container mx-auto max-w-2xl p-4 py-8 pb-24">
      <h1 className="mb-8 text-3xl font-bold tracking-tight">Aktive</h1>

      <Card className="bg-primary text-primary-foreground overflow-hidden border-none shadow-xl">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium opacity-80 uppercase tracking-wider">Баланс</span>
            <Wallet className="h-5 w-5 opacity-80" />
          </div>
          <CardTitle className="text-4xl font-extrabold">${balance.toFixed(2)}</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1 bg-white/20 hover:bg-white/30 border-none text-white">
              <ArrowDownLeft className="mr-2 h-4 w-4" /> Поповнити
            </Button>
            <Button variant="secondary" className="flex-1 bg-white/20 hover:bg-white/30 border-none text-white">
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
          <Button variant="ghost" size="sm" className="text-primary font-semibold">
            Всі
          </Button>
        </div>

        <Card className="border-dashed">
          <CardContent className="p-8 text-center text-muted-foreground flex flex-col items-center gap-2">
            <History className="h-12 w-12 opacity-20" />
            <p>У вас поки немає транзакцій.</p>
            <p className="text-xs">Тут з'являться дані про ваші дзвінки та поповнення.</p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
