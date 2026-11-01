import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RegistrationForm } from './registration-form';
import type { SignUpHandler } from './registration-schema';

describe('registration to email verification', () => {
  beforeEach(() => {
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
    vi.unstubAllGlobals();
  });

  async function submitValidRegistration() {
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: '  Alex Doe  ' } });
    fireEvent.change(screen.getByLabelText('Work email'), {
      target: { value: 'alex@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password', { exact: true }), {
      target: { value: 'longsecurepassphrase' },
    });
    fireEvent.change(screen.getByLabelText('Confirm password'), {
      target: { value: 'longsecurepassphrase' },
    });
    fireEvent.click(screen.getByRole('checkbox'));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Create account' })));
  }

  it('offers the verification route only after real adapter success and clears the fields', async () => {
    const onSignUp = vi.fn<SignUpHandler>(async () => undefined);
    render(<RegistrationForm onSignUp={onSignUp} onOpenDocument={vi.fn()} />);
    expect(screen.queryByRole('link', { name: /Continue to email verification/ })).toBeNull();
    await submitValidRegistration();
    expect(onSignUp).toHaveBeenCalledWith(
      expect.objectContaining({
        avatar: null,
        name: 'Alex Doe',
        email: 'alex@example.com',
        password: 'longsecurepassphrase',
        acceptedTerms: true,
      }),
    );
    expect(onSignUp.mock.calls[0]?.[0]).not.toHaveProperty('confirmPassword');
    expect(
      screen.getByRole('link', { name: /Continue to email verification/ }).getAttribute('href'),
    ).toBe('/verify-email');
    expect(screen.queryByLabelText('Password', { exact: true })).toBeNull();
    expect(screen.queryByText('alex@example.com')).toBeNull();
  });

  it('does not show the post-registration verification link without an adapter', async () => {
    render(<RegistrationForm onOpenDocument={vi.fn()} />);
    await submitValidRegistration();
    expect(screen.getByRole('alert').textContent).toContain('not available yet');
    expect(screen.queryByRole('link', { name: /Continue to email verification/ })).toBeNull();
  });
});
