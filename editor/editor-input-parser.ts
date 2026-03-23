import { hex, ref, px, rem, ms } from '../src/index';
import type { AnyTokenValue } from '../src/index';

/**
 * Parse a user-entered value string into a token value.
 * Supports:
 *   #ff0000 or any CSS color string -> hex(value)
 *   ref('scope.token') -> ref('scope.token')
 *   px(16) -> px(16)
 *   rem(1.5) -> rem(1.5)
 *   ms(200) -> ms(200)
 *
 * Falls back to hex() if nothing else matches.
 */
export function parseTokenInput(input: string): AnyTokenValue {
  const trimmed = input.trim();

  // ref('scope.token') or ref("scope.token")
  const refMatch = trimmed.match(/^ref\(\s*['"]([^'"]+)['"]\s*\)$/);
  if (refMatch) {
    return ref(refMatch[1]);
  }

  // px(number)
  const pxMatch = trimmed.match(/^px\(\s*([\d.]+)\s*\)$/);
  if (pxMatch) {
    return px(parseFloat(pxMatch[1]));
  }

  // rem(number)
  const remMatch = trimmed.match(/^rem\(\s*([\d.]+)\s*\)$/);
  if (remMatch) {
    return rem(parseFloat(remMatch[1]));
  }

  // ms(number)
  const msMatch = trimmed.match(/^ms\(\s*([\d.]+)\s*\)$/);
  if (msMatch) {
    return ms(parseFloat(msMatch[1]));
  }

  // Hex color: #rgb, #rrggbb, #rrggbbaa
  if (/^#([0-9a-fA-F]{3,8})$/.test(trimmed)) {
    return hex(trimmed);
  }

  // CSS named colors or other color formats (rgb, hsl, etc.)
  // Try as hex - culori's parse inside hex() will validate
  return hex(trimmed);
}
