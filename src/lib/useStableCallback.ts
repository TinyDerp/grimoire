import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * Returns a function with a stable identity that always calls the latest
 * version of `fn`. Use for callbacks passed to memoized children from
 * components that re-render often: the child's memo stays intact while the
 * callback still sees fresh state (no useCallback dependency auditing).
 *
 * The wrapper is for event handlers. Don't call it during render, and don't
 * put the result in effect dependency arrays expecting it to change: it never
 * does.
 */
export function useStableCallback<Args extends unknown[], R>(
  fn: (...args: Args) => R
): (...args: Args) => R {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: Args) => ref.current(...args), []);
}
