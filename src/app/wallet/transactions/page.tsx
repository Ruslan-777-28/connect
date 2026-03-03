'use client';

import { useUser, useFirestore, useMemoFirebase, useCollection } from '@/firebase';
import { collection, query, where, orderBy } from 'firebase/firestore';
import type { WalletLedgerEntry } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowUpRight, ArrowDownLeft, History, ArrowLeft, ArrowRightLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

export default function TransactionsPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const router = useRouter();

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

  return (
    <div className="container mx-auto max-w-2xl p-4 py-8 pb-24">
      <div className="flex items-center gap-4 mb-8">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => router.back()}
          className="rounded-full"
        >
          <ArrowLeft className="h-6 w-6" />
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Транзакції</h1>
      </div>

      <section className="space-y-4">
        {isLedgerLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : ledger && ledger.length > 0 ? (
          <div className="space-y-3">
            {ledger.map((entry) => (
              <Card key={entry.id} className="overflow-hidden border-primary/5 hover:border-primary/20 transition-all">
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
                      {entry.kind === 'call_minute' && <ArrowRightLeft className="h-4 w-4" />}
                      {entry.kind === 'call_finalize' && <ArrowRightLeft className="h-4 w-4" />}
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
          <Card className="border-dashed py-12">
            <CardContent className="p-0 text-center text-muted-foreground flex flex-col items-center gap-4">
              <div className="p-4 rounded-full bg-muted">
                <History className="h-12 w-12 opacity-20" />
              </div>
              <div className="space-y-1">
                <p className="font-medium">У вас поки немає транзакцій</p>
                <p className="text-xs max-w-[200px] mx-auto">Тут з'являться дані про ваші дзвінки та поповнення балансу.</p>
              </div>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
