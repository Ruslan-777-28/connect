
'use client';

import { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useFirebaseApp, useUser } from '@/firebase';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import Link from 'next/link';
import { ShieldCheck, ShieldAlert, Key } from 'lucide-react';

export default function DebugDailyPage() {
  const [roomUrl, setRoomUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { user } = useUser();
  const app = useFirebaseApp();

  const handleCreateRoom = async () => {
    if (!user) {
      setError('You must be logged in to create a room.');
      return;
    }
    setLoading(true);
    setError(null);
    setRoomUrl(null);
    try {
      const functions = getFunctions(app, 'us-central1');
      const createDailyRoom = httpsCallable(functions, 'createDailyRoom');

      const result: any = await createDailyRoom({});
      
      if (result.data?.roomUrl) {
        setRoomUrl(result.data.roomUrl);
      } else {
        setError(result.data?.error || 'No roomUrl returned from function.');
      }
    } catch (e: any) {
      console.error("DEBUG CREATE ROOM ERROR:", e);
      setError(e.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <Card className="mb-8 border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" />
            Відладка відеозв'язку Daily.co
          </CardTitle>
          <CardDescription>
            Використовуйте цю сторінку для перевірки коректності підключення ключів.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg bg-muted p-4 space-y-2">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Інструкція з налаштування:</h3>
            <ol className="text-xs list-decimal pl-4 space-y-1 text-muted-foreground">
              <li>Отримайте API Key на сайті <b>daily.co</b></li>
              <li>Виконайте в терміналі: <code className="bg-black/10 px-1 py-0.5 rounded">firebase functions:secrets:set DAILY_API_KEY</code></li>
              <li>Вставте ключ і натисніть Enter</li>
              <li><b>Важливо:</b> Після встановлення секрету потрібно передеплоїти функції!</li>
            </ol>
          </div>

          <Button 
            onClick={handleCreateRoom} 
            disabled={loading || !user}
            className="w-full"
          >
            {loading ? 'Перевірка підключення...' : 'Тестове створення кімнати'}
          </Button>

          {!user && (
            <div className="flex items-center gap-2 text-sm text-yellow-600 bg-yellow-50 p-3 rounded-md border border-yellow-200">
              <ShieldAlert className="h-4 w-4" />
              Будь ласка, увійдіть в акаунт, щоб почати тест.
            </div>
          )}

          {error && (
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg space-y-2">
              <div className="flex items-center gap-2 text-sm font-bold text-destructive">
                <ShieldAlert className="h-4 w-4" />
                Помилка авторизації
              </div>
              <p className="text-xs text-muted-foreground break-all">
                {error}
              </p>
              {error.includes("DAILY_API_KEY_NOT_CONFIGURED") && (
                <p className="text-[10px] font-bold text-destructive uppercase">
                  КЛЮЧ НЕ ЗНАЙДЕНО АБО ВІН НЕКОРЕКТНИЙ
                </p>
              )}
            </div>
          )}

          {roomUrl && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-green-700">
                <ShieldCheck className="h-4 w-4" />
                Ключі працюють успішно!
              </div>
              <p className="text-xs text-green-600">
                Кімната створена на сервері. Ви можете відкрити її для перевірки:
              </p>
              <div className="rounded-md border bg-white p-3 shadow-sm">
                <Link
                  href={roomUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all text-xs text-primary hover:underline font-mono"
                >
                  {roomUrl}
                </Link>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
