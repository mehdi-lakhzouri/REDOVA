import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCooldown } from './use-cooldown';

describe('useCooldown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-01T10:00:00Z'));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('expires and releases its interval', () => {
    const { result } = renderHook(() => useCooldown());
    act(() => result.current.start(2));
    expect(result.current.remaining).toBe(2);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.remaining).toBe(1);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.remaining).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('accounts for time spent in a suspended/background tab', () => {
    const { result } = renderHook(() => useCooldown());
    act(() => result.current.start(60));
    vi.setSystemTime(new Date('2026-11-01T10:02:00Z'));
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.remaining).toBe(0);
  });

  it('restarts an active countdown and clears its timer on unmount', () => {
    const { result, unmount } = renderHook(() => useCooldown());
    act(() => result.current.start(60));
    act(() => vi.advanceTimersByTime(1000));
    act(() => result.current.start(3));
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.remaining).toBe(2);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ignores invalid durations and rounds fractional seconds up', () => {
    const { result } = renderHook(() => useCooldown());
    for (const seconds of [NaN, Infinity, -5]) {
      act(() => result.current.start(seconds));
      expect(result.current.remaining).toBe(0);
    }
    act(() => result.current.start(1.2));
    expect(result.current.remaining).toBe(2);
  });
});
