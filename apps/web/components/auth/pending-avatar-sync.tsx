'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useSession } from '@/lib/auth-client';
import { authErrorMessage } from '@/lib/auth/auth-errors';
import { uploadAvatar } from '@/lib/avatar/avatar-api';
import { clearPendingAvatar, takePendingAvatar } from '@/lib/avatar/pending-avatar-store';
import { RedovaApiError } from '@/lib/api';

/**
 * Uploads the picture chosen at sign-up once a verified session exists. It never replaces a
 * picture the account already has, and network failures keep the file for the next visit.
 */
export function PendingAvatarSync() {
  const { data: session, refetch } = useSession();
  const started = useRef(false);
  const user = session?.user;

  useEffect(() => {
    if (!user?.emailVerified || started.current) return;
    started.current = true;

    void (async () => {
      const pending = await takePendingAvatar(user.email);
      if (!pending) return;
      if (user.image) {
        await clearPendingAvatar();
        return;
      }
      try {
        await uploadAvatar(pending.file, pending.filename);
        await clearPendingAvatar();
        refetch();
        toast.success('Profile picture added');
      } catch (error) {
        if (error instanceof RedovaApiError && error.status < 500) {
          await clearPendingAvatar();
          toast.error('Your profile picture could not be added', {
            description: authErrorMessage(error, 'Add it again from your profile settings.'),
          });
        }
      }
    })();
  }, [user, refetch]);

  return null;
}
