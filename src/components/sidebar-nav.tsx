
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { doc } from 'firebase/firestore';
import { Home, User, LogOut, LogIn, UserPlus, MessageSquare, Bell } from 'lucide-react';
import {
  useUser,
  useAuth,
  useFirestore,
  useDoc,
  useMemoFirebase,
} from '@/firebase';
import { UserAvatar } from './user-avatar';
import type { UserProfile, Availability } from '@/lib/types';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';
import { Skeleton } from './ui/skeleton';
import { AvailabilitySwitch } from './AvailabilitySwitch';
import { useAvailability } from '@/hooks/useAvailability';
import { Badge } from './ui/badge';

export function SidebarNav() {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const firestore = useFirestore();
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();

  const userDocRef = useMemoFirebase(
    () => (user ? doc(firestore, 'users', user.uid) : null),
    [user, firestore]
  );

  const { data: userProfile, isLoading: isProfileLoading } =
    useDoc<UserProfile>(userDocRef);

  const { availability, isLoading: isAvailabilityLoading } = useAvailability(
    user?.uid
  );

  const logout = () => {
    auth.signOut();
    setOpenMobile(false);
  };

  const closeSheet = () => {
    setOpenMobile(false);
  };

  const navLinks = user
    ? [
        { href: '/', label: 'Home', icon: Home },
        { href: '/chats', label: 'Chats', icon: MessageSquare },
        { href: '/notifications', label: 'Notifications', icon: Bell, badge: '2' },
        { href: '/profile', label: 'Profile', icon: User },
      ]
    : [];

  const authLinks = [
    { href: '/login', label: 'Login', icon: LogIn },
    { href: '/register', label: 'Register', icon: UserPlus },
  ];

  const isActive = (href: string) => {
    return href === '/' ? pathname === href : pathname.startsWith(href);
  };

  const isLoading =
    isUserLoading || (user && (isProfileLoading || isAvailabilityLoading));

  return (
    <Sidebar collapsible="icon" side="left" className="border-r">
      <SidebarHeader className="border-b p-2">
        {isLoading ? (
          <div className="flex items-center gap-3 p-1">
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="flex flex-col gap-1">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        ) : userProfile ? (
          <SidebarMenuButton
            asChild
            size="lg"
            onClick={closeSheet}
            className="h-auto p-1"
          >
            <Link href="/profile">
              <UserAvatar user={userProfile} className="size-9" />
              <div className="flex flex-col">
                <span className="font-semibold">{userProfile.name}</span>
                <span className="text-xs text-muted-foreground">
                  {userProfile.email}
                </span>
              </div>
            </Link>
          </SidebarMenuButton>
        ) : (
          <div className="p-2 text-lg font-semibold">ConnectU</div>
        )}
      </SidebarHeader>

      <SidebarContent className="flex-1 p-2">
        <SidebarMenu>
          {(user ? navLinks : authLinks).map(({ href, label, icon: Icon, badge }) => (
            <SidebarMenuItem key={label}>
              <SidebarMenuButton
                asChild
                isActive={isActive(href)}
                onClick={closeSheet}
                tooltip={label}
              >
                <Link href={href} className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <Icon />
                    <span>{label}</span>
                  </div>
                  {badge && (
                    <Badge variant="destructive" className="h-4 min-w-[16px] px-1 flex items-center justify-center text-[10px] group-data-[collapsible=icon]:absolute group-data-[collapsible=icon]:top-0 group-data-[collapsible=icon]:right-0">
                      {badge}
                    </Badge>
                  )}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>

      {user && (
        <SidebarFooter className="flex flex-col gap-2 border-t p-2">
          {isLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <AvailabilitySwitch
              initialAvailability={availability}
              className="w-full rounded-md bg-sidebar-accent p-2 group-data-[collapsible=icon]:w-auto group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-0"
              labelClassName="text-sidebar-accent-foreground group-data-[collapsible=icon]:hidden"
            />
          )}
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={logout} tooltip="Logout">
                <LogOut />
                <span>Logout</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
