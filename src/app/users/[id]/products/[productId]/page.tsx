
'use client';

import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Package, ShoppingCart, Loader2, Info } from 'lucide-react';
import { useDoc, useFirestore, useMemoFirebase, useCollection, useUser, useFirebaseApp } from '@/firebase';
import { doc, collection, query, where, orderBy, limit } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type { DigitalProduct, UserProfile } from '@/lib/types';
import { UserAvatar } from '@/components/user-avatar';
import { ProductCard } from '@/components/product-card';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const productId = params.productId as string;
  const firestore = useFirestore();
  const { user: currentUser } = useUser();
  const app = useFirebaseApp();
  const { toast } = useToast();

  const [isBuying, setIsBuying] = useState(false);
  const [showBuyDialog, setShowBuyDialog] = useState(false);

  const userDocRef = useMemoFirebase(() => doc(firestore, 'users', id), [firestore, id]);
  const { data: author } = useDoc<UserProfile>(userDocRef);

  const productDocRef = useMemoFirebase(() => doc(firestore, 'products', productId), [firestore, productId]);
  const { data: product, isLoading: productLoading } = useDoc<DigitalProduct>(productDocRef);

  const otherProductsQuery = useMemoFirebase(() => 
    query(collection(firestore, 'products'), where('authorId', '==', id), limit(6)), 
  [firestore, id]);
  const { data: otherProducts } = useCollection<DigitalProduct>(otherProductsQuery);

  const handleBuy = async () => {
    if (!currentUser) {
      router.push('/login');
      return;
    }
    if (!product) return;

    setIsBuying(true);
    try {
      const functions = getFunctions(app, 'us-central1');
      const createReq = httpsCallable(functions, 'createCommunicationRequest');
      
      // Using 'product' type which mimics the Q&A hold logic
      await createReq({
        productId: product.id,
        type: 'product',
        questionText: `Purchase: ${product.title}`
      });

      toast({ title: 'Запит надіслано', description: 'Ваше замовлення з\'явилося в розділі Aktive. Продавець має підтвердити продаж.' });
      router.push('/wallet');
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Помилка', description: e.message });
    } finally {
      setIsBuying(false);
      setShowBuyDialog(false);
    }
  };

  if (productLoading) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-12 flex flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Завантаження товару...</p>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-8 text-center">
        <h1 className="text-2xl font-bold">Товар не знайдено</h1>
        <Button variant="link" onClick={() => router.back()} className="mt-4">Назад</Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8 pb-32">
      <Button variant="ghost" className="mb-6 -ml-2 text-muted-foreground" onClick={() => router.back()}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Назад
      </Button>

      <div className="grid gap-8 md:grid-cols-2">
        <div className="space-y-6">
          <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-muted shadow-lg border">
            {product.imageUrl ? (
              <Image src={product.imageUrl} alt={product.title} fill className="object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground/10"><Package className="h-32 w-32" /></div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="space-y-2">
            <span className="text-xs font-bold text-primary uppercase tracking-widest">{product.categoryId} / {product.subcategoryId}</span>
            <h1 className="text-3xl font-bold tracking-tight">{product.title}</h1>
          </div>

          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase font-semibold">Ціна</p>
                <p className="text-3xl font-extrabold text-primary">{product.price} COIN</p>
              </div>
              <Button size="lg" className="rounded-full px-8 shadow-xl" onClick={() => setShowBuyDialog(true)}>
                <ShoppingCart className="mr-2 h-5 w-5" /> Придбати
              </Button>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <h2 className="text-lg font-bold flex items-center gap-2 border-b pb-2">
              <Info className="h-4 w-4 text-primary" /> Опис товару
            </h2>
            <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">{product.description}</p>
          </div>

          <div className="flex items-center gap-4 py-6 border-t">
            {author && (
              <div className="flex items-center gap-3">
                <UserAvatar user={author} className="h-12 w-12" />
                <div>
                  <p className="font-bold">{author.name}</p>
                  <p className="text-xs text-muted-foreground">Власник магазину</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <section className="mt-16 space-y-8 pt-8 border-t">
        <h2 className="text-2xl font-bold tracking-tight">Інші товари автора</h2>
        <div className="grid gap-6 grid-cols-2 sm:grid-cols-3 md:grid-cols-4">
          {otherProducts?.filter(p => p.id !== productId).map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>

      <Dialog open={showBuyDialog} onOpenChange={setShowBuyDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Купівля цифрового товару</DialogTitle>
            <DialogDescription>
              Сума {product.price} COIN буде зарезервована на вашому балансі. 
              Продавець отримає сповіщення та має підтвердити продаж, після чого ви отримаєте доступ до контенту.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button variant="outline" className="flex-1" onClick={() => setShowBuyDialog(false)}>Скасувати</Button>
            <Button className="flex-1 bg-green-600 text-white" onClick={handleBuy} disabled={isBuying}>
              {isBuying ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Підтвердити покупку'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
