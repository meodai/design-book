import { extractDependencies, extractVisualDependencies, val } from '../../tokens';
import type { FunctionTokenValue, TokenValue, ReferenceValue } from '../../tokens';
import type { Scope } from '../../scope';

export function timingImpl(duration: string, easing: string, delay: number): string {
  if (delay > 0) {
    return `${duration} ${easing} ${delay}ms`;
  }
  return `${duration} ${easing}`;
}

export function timing(
  duration: TokenValue | ReferenceValue,
  easing: string,
  scope: Scope,
  options?: { delay?: number; description?: string }
): FunctionTokenValue {
  const delay = options?.delay ?? 0;
  return val(
    {
      type: 'function' as const,
      rawValue: 'timing',
      implementation: (...args: any[]) => timingImpl(args[0], easing, delay),
      args: [duration, scope],
      metadata: {
        dependencies: extractDependencies([duration]),
        visualDependencies: extractVisualDependencies([duration, scope]),
        returnType: 'timing',
      },
    },
    options
  );
}
