import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkSlug } from '@/lib/onboarding/api';
import { useSlugAvailability } from './use-slug-availability';
vi.mock('@/lib/onboarding/api', () => ({
  checkSlug: vi.fn(),
  onboardingMessage: () => 'Check failed',
}));
beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(checkSlug).mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
describe('useSlugAvailability', () => {
  it('never requests reserved slugs and debounces valid input', async () => {
    vi.mocked(checkSlug).mockResolvedValue(true);
    const { result, rerender } = renderHook(({ slug }) => useSlugAvailability(slug), {
      initialProps: { slug: 'admin' },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(checkSlug).not.toHaveBeenCalled();
    rerender({ slug: 'acme' });
    expect(result.current.status).toBe('checking');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(399);
    });
    expect(checkSlug).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(result.current.status).toBe('available');
  });
  it('ignores a stale successful response after the input changes', async () => {
    let resolveOld!: (value: boolean) => void;
    vi.mocked(checkSlug)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValueOnce(false);
    const { result, rerender } = renderHook(({ slug }) => useSlugAvailability(slug), {
      initialProps: { slug: 'first' },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    const signal = vi.mocked(checkSlug).mock.calls[0][1];
    rerender({ slug: 'second' });
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      resolveOld(true);
    });
    expect(result.current.status).toBe('checking');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(result.current.status).toBe('taken');
  });
  it('can retry a failed request and aborts on unmount', async () => {
    vi.mocked(checkSlug).mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce(true);
    const { result, unmount } = renderHook(() => useSlugAvailability('acme'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(result.current.status).toBe('error');
    act(() => result.current.retry());
    expect(result.current.status).toBe('checking');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(result.current.status).toBe('available');
    unmount();
    expect(vi.mocked(checkSlug).mock.calls[1][1]?.aborted).toBe(true);
  });
});
