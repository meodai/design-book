import { extractDependencies, val } from '../../tokens';
import type { FunctionTokenValue, TokenValue, ReferenceValue } from '../../tokens';

export function typographyScaleImpl(baseValue: string, ratio: number, step: number): string {
  const match = baseValue.match(/^([\d.]+)(.*)$/);
  if (!match) {
    throw new Error(`typographyScale: cannot parse value "${baseValue}"`);
  }
  const num = parseFloat(match[1]);
  const unit = match[2];
  const result = num * Math.pow(ratio, step);
  // Round to avoid floating point noise (keep up to 4 significant decimal digits)
  const rounded = Math.round(result * 10000) / 10000;
  return `${rounded}${unit}`;
}

export function typographyScale(
  baseSize: TokenValue | ReferenceValue,
  options?: { ratio?: number; step?: number; description?: string }
): FunctionTokenValue {
  const ratio = options?.ratio ?? 1.25;
  const step = options?.step ?? 0;
  return val(
    {
      type: 'function' as const,
      rawValue: 'typographyScale',
      implementation: (...args: any[]) => typographyScaleImpl(args[0], ratio, step),
      args: [baseSize],
      options: { ratio, step },
      metadata: {
        dependencies: extractDependencies([baseSize]),
        visualDependencies: [],
        returnType: 'dimension',
      },
    },
    options
  );
}
