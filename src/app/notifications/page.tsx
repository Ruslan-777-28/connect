
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bell, Info, UserPlus, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const systemNotifications = [
  {
    id: 'sys1',
    title: 'Ласкаво просимо до ConnectU!',
    message: 'Дякуємо, що приєдналися до нашої платформи. Налаштуйте свій профіль, щоб почати працювати.',
    date: 'Сьогодні, 10:00',
    read: false
  },
  {
    id: 'sys2',
    title: 'Оновлення системи',
    message: 'Ми додали нову функцію холдування коштів для вашої безпеки.',
    date: 'Вчора, 18:30',
    read: true
  }
];

const userNotifications = [
  {
    id: 'user1',
    title: 'Новий запит на консультацію',
    message: 'Користувач Олексій хоче замовити послугу "Бізнес-стратегія".',
    date: '15 хв тому',
    read: false,
    link: '/wallet'
  }
];

export default function NotificationsPage() {
  const [activeTab, setActiveTab] = useState('system');
  const router = useRouter();

  const handleNotificationClick = (link?: string) => {
    if (link) {
      router.push(link);
    }
  };

  const renderNotification = (notif: any) => (
    <Card 
      key={notif.id} 
      className={cn(
        "mb-3 transition-all border-primary/5",
        !notif.read ? "bg-primary/5 border-primary/20" : "opacity-80",
        notif.link && "cursor-pointer hover:bg-accent"
      )}
      onClick={() => handleNotificationClick(notif.link)}
    >
      <CardContent className="p-4 flex items-start gap-4">
        <div className={cn(
          "p-2 rounded-full",
          notif.link ? "bg-green-100 text-green-600" : "bg-blue-100 text-blue-600"
        )}>
          {notif.link ? <UserPlus className="h-5 w-5" /> : <Info className="h-5 w-5" />}
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold text-sm">{notif.title}</h3>
            {!notif.read && <div className="h-2 w-2 rounded-full bg-primary" />}
          </div>
          <p className="text-xs text-muted-foreground mb-2 leading-relaxed">{notif.message}</p>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground/70 uppercase font-medium">{notif.date}</span>
            {notif.link && (
              <span className="text-[10px] text-primary font-bold flex items-center gap-1">
                ПЕРЕЙТИ <ArrowRight className="h-3 w-3" />
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8 pb-24">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Сповіщення</h1>
        <div className="bg-primary/10 text-primary text-[10px] px-2 py-1 rounded-full font-bold">
          2 НОВИХ
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="system">Системні</TabsTrigger>
          <TabsTrigger value="users">Користувачів</TabsTrigger>
        </TabsList>

        <ScrollArea className="h-[calc(100vh-250px)]">
          <TabsContent value="system" className="mt-0">
            {systemNotifications.length > 0 ? (
              systemNotifications.map(renderNotification)
            ) : (
              <div className="text-center py-12 text-muted-foreground border border-dashed rounded-xl">
                У вас немає системних сповіщень.
              </div>
            )}
          </TabsContent>

          <TabsContent value="users" className="mt-0">
            {userNotifications.length > 0 ? (
              userNotifications.map(renderNotification)
            ) : (
              <div className="text-center py-12 text-muted-foreground border border-dashed rounded-xl">
                Запити від інших користувачів відсутні.
              </div>
            )}
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
}
