import { apiFetch } from '@/lib/api';

/** `POST /api/v1/users/me/avatar`: one multipart field named `file`, session required. */
export async function uploadAvatar(file: Blob, filename = 'avatar'): Promise<{ image: string }> {
  const body = new FormData();
  body.append('file', file, filename);
  const { data } = await apiFetch<{ image: string }>('/users/me/avatar', { method: 'POST', body });
  return data;
}
