import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailVerificationActions } from './email-verification-actions';

describe('EmailVerificationActions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: true,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('does not claim delivery or start a cooldown without an adapter', () => {
    render(<EmailVerificationActions />);
    fireEvent.click(screen.getByRole('button', { name: 'Resend email' }));
    expect(screen.getByRole('alert').textContent).toContain('not available yet');
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('button', { name: 'Resend email' }).hasAttribute('disabled')).toBe(
      false,
    );
  });

  it('prevents duplicate requests and starts its countdown only after success', async () => {
    let complete!: () => void;
    const onResend = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
    render(<EmailVerificationActions onResend={onResend} />);
    fireEvent.click(screen.getByRole('button', { name: 'Resend email' }));
    const pending = screen.getByRole('button', { name: 'Resending email…' });
    fireEvent.click(pending);
    expect(pending.hasAttribute('disabled')).toBe(true);
    expect(onResend).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('status')).toBeNull();
    await act(async () => complete());
    expect(screen.getByRole('status').textContent).toContain('If a verification email can be sent');
    expect(screen.getByRole('button', { name: 'Resend in 60s' }).hasAttribute('disabled')).toBe(
      true,
    );
    act(() => vi.advanceTimersByTime(60000));
    expect(screen.getByRole('button', { name: 'Resend email' }).hasAttribute('disabled')).toBe(
      false,
    );
  });

  it('respects a retry delay returned with an adapter error', async () => {
    const onResend = vi.fn(async () => ({
      error: 'Please wait before trying again.',
      retryAfterSeconds: 45,
    }));
    render(<EmailVerificationActions onResend={onResend} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Resend email' })));
    expect(screen.getByRole('alert').textContent).toBe('Please wait before trying again.');
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('button', { name: 'Resend in 45s' }).hasAttribute('disabled')).toBe(
      true,
    );
  });

  it('handles a rejected request without success, cooldown or raw exception disclosure', async () => {
    const onResend = vi.fn(async () => {
      throw new Error('private provider detail');
    });
    render(<EmailVerificationActions onResend={onResend} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Resend email' })));
    expect(screen.getByRole('alert').textContent).toBe(
      'Unable to resend the verification email. Please try again.',
    );
    expect(screen.queryByText('private provider detail')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('button', { name: 'Resend email' }).hasAttribute('disabled')).toBe(
      false,
    );
  });
});
