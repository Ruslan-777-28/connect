'use client';

import {
  createContext,
  useState,
  useEffect,
  type ReactNode,
  useMemo,
} from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { usePathname, useRouter } from 'next/navigation';
import { type UserProfile } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';

export interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(
  undefined
);

const protectedRoutes = ['/', '/profile', '/users'];
const authRoutes = ['/login', '/register'];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setLoading(true);
      if (user) {
        setUser(user);
        const userRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(userRef);

        if (docSnap.exists()) {
          setUserProfile(docSnap.data() as UserProfile);
        } else {
          const newUserProfile: UserProfile = {
            uid: user.uid,
            email: user.email || '',
            name: user.displayName || 'New User',
            createdAt: serverTimestamp(),
            bio: '',
            avatarUrl: user.photoURL || '',
          };
          await setDoc(userRef, newUserProfile);
          setUserProfile(newUserProfile);
        }
      } else {
        setUser(null);
        setUserProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (loading) return;

    const isProtectedRoute =
      protectedRoutes.some((route) => pathname.startsWith(route)) ||
      pathname === '/';
    const isAuthRoute = authRoutes.includes(pathname);

    if (!user && isProtectedRoute) {
      router.push('/login');
    }

    if (user && isAuthRoute) {
      router.push('/');
    }
  }, [user, loading, pathname, router]);

  const logout = async () => {
    await auth.signOut();
    router.push('/login');
  };

  const value = useMemo(
    () => ({
      user,
      userProfile,
      loading,
      logout,
    }),
    [user, userProfile, loading]
  );

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-[250px]" />
            <Skeleton className="h-4 w-[200px]" />
          </div>
        </div>
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
