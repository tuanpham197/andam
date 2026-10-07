import { act, renderHook } from '@testing-library/react';
import { useDebouncedValue } from './use-debounced-value';

describe('useDebouncedValue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('only publishes the last value once typing pauses', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 200), {
      initialProps: { value: 'c' },
    });
    expect(result.current).toBe('c');
    rerender({ value: 'ca' });
    rerender({ value: 'ca r' });
    act(() => vi.advanceTimersByTime(199));
    expect(result.current).toBe('c');
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe('ca r');
  });
});
