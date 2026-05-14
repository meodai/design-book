import { createFunctionToken, extractDependencies } from '../../tokens';
import type { FunctionTokenValue, TokenValue, ReferenceValue } from '../../tokens';

export function timingImpl(duration: string, easing: string, delay: number): string {
  if (delay > 0) {
    return `${duration} ${easing} ${delay}ms`;
  }
  return `${duration} ${easing}`;
}

export function timing(
  duration: TokenValue | ReferenceValue | FunctionTokenValue,
  easing: string,
  options?: { delay?: number; description?: string }
): FunctionTokenValue {
  const delay = options?.delay ?? 0;
  return createFunctionToken(
    'timing',
    [duration, easing],
    {
      options: { delay },
      metadata: {
        dependencies: extractDependencies([duration]),
        visualDependencies: [],
        returnType: 'timing',
      },
    },
  );
}
