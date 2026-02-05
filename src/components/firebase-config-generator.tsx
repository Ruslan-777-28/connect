'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { generateFirebaseConfigAction } from '@/lib/actions';
import { Copy, Sparkles } from 'lucide-react';
import { Skeleton } from './ui/skeleton';

export function FirebaseConfigGenerator() {
  const [config, setConfig] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleGenerate = async () => {
    setLoading(true);
    setConfig(null);
    const result = await generateFirebaseConfigAction();
    if (result.success) {
      setConfig(result.data);
    } else {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: result.error,
      });
    }
    setLoading(false);
  };

  const handleCopy = () => {
    if (config) {
      navigator.clipboard.writeText(config);
      toast({
        title: 'Copied!',
        description: 'Firebase config copied to clipboard.',
      });
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Click the button below to generate Firebase environment variables. Add
        these to a `.env.local` file in the root of your project.
      </p>
      <div>
        <Button onClick={handleGenerate} disabled={loading}>
          <Sparkles className="mr-2 h-4 w-4" />
          {loading ? 'Generating...' : 'Generate Config'}
        </Button>
      </div>

      {loading && (
        <div className="space-y-2 rounded-md border bg-muted p-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/6" />
          <Skeleton className="h-4 w-full" />
        </div>
      )}

      {config && (
        <div className="relative rounded-md border bg-muted p-4 font-mono text-sm">
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-2 h-7 w-7"
            onClick={handleCopy}
          >
            <Copy className="h-4 w-4" />
          </Button>
          <pre className="whitespace-pre-wrap break-all">{config}</pre>
        </div>
      )}
    </div>
  );
}
