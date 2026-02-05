import { FirebaseConfigGenerator } from '@/components/firebase-config-generator';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export default function AdminPage() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-8 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
        Admin Tools
      </h1>
      <Card>
        <CardHeader>
          <CardTitle>Firebase .env.local Generator</CardTitle>
          <CardDescription>
            Generate the necessary Firebase configuration settings for your
            .env.local file.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FirebaseConfigGenerator />
        </CardContent>
      </Card>
    </div>
  );
}
