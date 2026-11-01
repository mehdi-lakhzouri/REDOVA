'use client';

import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { routes } from '@/config/site';
import { authClient, useSession } from '@/lib/auth-client';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

/** Signed-in identity, as returned by `GET /api/auth/get-session`. */
export function AccountSummary() {
  const router = useRouter();
  const { data: session } = useSession();
  if (!session) return null;
  const { user } = session;

  async function signOut() {
    await authClient.signOut();
    router.replace(routes.signIn);
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-4">
        <Avatar className="size-14">
          {user.image && <AvatarImage src={user.image} alt="" />}
          <AvatarFallback>{initials(user.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{user.name}</p>
          <p className="truncate text-sm text-muted-foreground">{user.email}</p>
        </div>
        {user.emailVerified && <Badge variant="success">Email verified</Badge>}
        <Button variant="outline" onClick={signOut}>
          <LogOut aria-hidden />
          Sign out
        </Button>
      </CardContent>
    </Card>
  );
}
