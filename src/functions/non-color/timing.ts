import { assertNumber, valueArg, assertOptions } from '../args';
import { createFunctionToken } from '../../tokens';
import type { FunctionTokenValue, TokenValue, ReferenceValue } from '../../tokens';

/** A CSS transition timing: `duration easing`, plus `delay` in ms when set. */
export function timingImpl(duration: string, easing: string, options?: { delay?: number }): string {
  const delay = options?.delay ?? 0;
  return delay !== 0 ? `${duration} ${easing} ${delay}ms` : `${duration} ${easing}`;
}

export function timing(
  duration: TokenValue | ReferenceValue | FunctionTokenValue,
  easing: string,
  options?: { delay?: number; description?: string },
): FunctionTokenValue {
  assertOptions('timing', options, ['delay']);
  valueArg('timing', duration);
  const delay = options?.delay ?? 0;
  // A negative delay is valid CSS: the transition starts partway through.
  assertNumber('timing', 'delay', delay);
  return createFunctionToken('timing', [duration, easing], {
    description: options?.description,
    options: { delay },
    metadata: { dependencies: [], returnType: 'timing' },
  });
}
