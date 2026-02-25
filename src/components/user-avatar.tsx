import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { UserProfile } from '@/lib/types';
import { cn } from '@/lib/utils';
import { User as UserIcon } from 'lucide-react';
import { isInstantOnline } from '@/lib/availability';

interface UserAvatarProps {
  user: UserProfile;
  className?: string;
}

const getInitials = (name: string) => {
  const names = name.split(' ');
  if (names.length > 1) {
    return `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
};

export function UserAvatar({ user, className }: UserAvatarProps) {
  const online = isInstantOnline(user?.availability);

  return (
    <Avatar className={cn('h-10 w-10', className, online && 'ring-2 ring-green-500 ring-offset-2 ring-offset-background')}>
      <AvatarImage src={user.avatarUrl} alt={user.name} />
      <AvatarFallback>
        {user.name ? (
          getInitials(user.name)
        ) : (
          <UserIcon className="h-5 w-5" />
        )}
      </AvatarFallback>
    </Avatar>
  );
}
