
'use client';

import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { UserAvatar } from '@/components/user-avatar';
import { Video, FileText, HelpCircle, ChevronRight } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

// Demo data for chats
const customerChats = [
  {
    id: 'chat1',
    otherParty: { id: 'u1', name: 'Олексій Дизайнер', avatarUrl: 'https://picsum.photos/seed/10/200' },
    type: 'text',
    date: '24 Травня, 14:20',
    reward: 50,
    preview: 'Дякую за відповідь щодо логотипу!',
    status: 'completed'
  },
  {
    id: 'chat2',
    otherParty: { id: 'u2', name: 'Марина Маркетолог', avatarUrl: 'https://picsum.photos/seed/11/200' },
    type: 'file',
    date: '22 Травня, 09:15',
    reward: 120,
    preview: 'Ось файл з аналізом конкурентів.',
    status: 'completed'
  }
];

const professionalChats = [
  {
    id: 'chat3',
    otherParty: { id: 'u3', name: 'Іван Замовник', avatarUrl: 'https://picsum.photos/seed/12/200' },
    type: 'text',
    date: '25 Травня, 11:00',
    reward: 80,
    preview: 'Чи зможете ви перевірити мій код сьогодні?',
    status: 'completed'
  }
];

export default function ChatsPage() {
  const [activeTab, setActiveTab] = useState('customer');

  const renderIcon = (type: string) => {
    switch (type) {
      case 'video': return <Video className="h-4 w-4" />;
      case 'file': return <FileText className="h-4 w-4" />;
      case 'text': return <HelpCircle className="h-4 w-4" />;
      default: return null;
    }
  };

  const renderChatCard = (chat: any) => (
    <Card key={chat.id} className="mb-3 cursor-pointer hover:bg-accent/50 transition-colors border-primary/5 shadow-sm">
      <CardContent className="p-4 flex items-center gap-4">
        <UserAvatar user={chat.otherParty} className="h-12 w-12" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold text-sm truncate">{chat.otherParty.name}</h3>
            <span className="text-[10px] text-muted-foreground">{chat.date}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <span className="flex items-center gap-1">
              {renderIcon(chat.type)}
              <span className="capitalize">{chat.type === 'text' ? 'Питання' : chat.type === 'file' ? 'Файл' : 'Відео'}</span>
            </span>
            <span>•</span>
            <span className="font-medium text-primary">{chat.reward} COIN</span>
          </div>
          <p className="text-xs text-foreground/70 truncate italic">"{chat.preview}"</p>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </CardContent>
    </Card>
  );

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8 pb-24">
      <h1 className="mb-6 text-3xl font-bold tracking-tight">Чати</h1>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="customer">Я замовник</TabsTrigger>
          <TabsTrigger value="professional">Я професіонал</TabsTrigger>
        </TabsList>

        <ScrollArea className="h-[calc(100vh-250px)]">
          <TabsContent value="customer" className="mt-0">
            {customerChats.length > 0 ? (
              customerChats.map(renderChatCard)
            ) : (
              <div className="text-center py-12 text-muted-foreground border border-dashed rounded-xl">
                У вас немає завершених чатів як замовника.
              </div>
            )}
          </TabsContent>

          <TabsContent value="professional" className="mt-0">
            {professionalChats.length > 0 ? (
              professionalChats.map(renderChatCard)
            ) : (
              <div className="text-center py-12 text-muted-foreground border border-dashed rounded-xl">
                Ви ще не завершили жодної консультації.
              </div>
            )}
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
}
