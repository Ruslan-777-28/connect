
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CommunicationTypeModal } from '@/components/create/CommunicationTypeModal';
import { Card, CardContent } from '@/components/ui/card';
import { MessageSquare, Package, Layout } from 'lucide-react';

export default function CreatePage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const router = useRouter();

  return (
    <div className="container mx-auto max-w-3xl p-4 py-8">
      <h1 className="mb-8 text-2xl font-bold">Створити</h1>

      <div className="grid gap-4">
        <Card 
          className="cursor-pointer transition-colors hover:bg-accent/50"
          onClick={() => setIsModalOpen(true)}
        >
          <CardContent className="flex items-start gap-4 p-6">
            <div className="rounded-full bg-primary/10 p-3 text-primary">
              <MessageSquare className="h-6 w-6" />
            </div>
            <div>
              <div className="text-lg font-semibold">Комунікація</div>
              <p className="text-sm text-muted-foreground">
                Відеочат / Файл + повідомлення / 1 питання–1 відповідь
              </p>
            </div>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer transition-colors hover:bg-accent/50"
          onClick={() => router.push('/create/post')}
        >
          <CardContent className="flex items-start gap-4 p-6">
            <div className="rounded-full bg-primary/10 p-3 text-primary">
              <Layout className="h-6 w-6" />
            </div>
            <div>
              <div className="text-lg font-semibold">Пост</div>
              <p className="text-sm text-muted-foreground">Опублікуйте статтю чи новину у свій профіль</p>
            </div>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer transition-colors hover:bg-accent/50"
          onClick={() => router.push('/create/product')}
        >
          <CardContent className="flex items-start gap-4 p-6">
            <div className="rounded-full bg-primary/10 p-3 text-primary">
              <Package className="h-6 w-6" />
            </div>
            <div>
              <div className="text-lg font-semibold">Цифровий товар</div>
              <p className="text-sm text-muted-foreground">Продавайте гайди, фото чи будь-які файли</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <CommunicationTypeModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onPick={(type) => {
          setIsModalOpen(false);
          router.push(`/create/communication?type=${type}`);
        }}
      />
    </div>
  );
}
