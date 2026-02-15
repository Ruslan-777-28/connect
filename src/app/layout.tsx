import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { FirebaseClientProvider } from '@/firebase/client-provider';
import { Header } from '@/components/header';
import { Toaster } from '@/components/ui/toaster';
import './globals.css';
import { FirebaseErrorListener } from '@/components/FirebaseErrorListener';
import { CallManager } from '@/components/CallManager';
import { IncomingCallManager } from '@/components/IncomingCallManager';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'ConnectU',
  description: 'Connect with other users.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-body antialiased`}>
        <FirebaseClientProvider>
          <FirebaseErrorListener />
          <CallManager />
          <IncomingCallManager />
          <div className="flex min-h-screen w-full flex-col">
            <Header />
            <main className="flex-1">{children}</main>
          </div>
          <Toaster />
        </FirebaseClientProvider>
      </body>
    </html>
  );
}
