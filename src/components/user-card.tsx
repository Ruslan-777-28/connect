import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { UserAvatar } from '@/components/user-avatar';
import type { UserProfile } from '@/lib/types';

interface UserCardProps {
  user: UserProfile;
}

export function UserCard({ user }: UserCardProps) {
  return (
    <Link href={`/users/${user.id}`} className="group">
      <Card className="h-full overflow-hidden transition-all duration-300 ease-in-out group-hover:shadow-lg group-hover:-translate-y-1">
        <CardContent className="flex flex-col items-center p-6 text-center">
          <UserAvatar user={user} className="mb-4 h-24 w-24 border-2 border-primary/20" />
          <h3 className="text-lg font-semibold text-foreground">{user.name}</h3>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
