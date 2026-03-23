import type { DesignBook } from '../src/index';

interface Suggestion {
  label: string;
  insertText: string;
  group: 'References' | 'Functions' | 'Values';
  swatchColor?: string;
}

const FUNCTION_NAMES = [
  'bestContrastWith', 'minContrastWith', 'colorMix',
  'lighten', 'darken', 'relativeTo',
  'closestColor', 'furthestFrom', 'averageColor',
  'spacingScale', 'typographyScale', 'timing',
];

const VALUE_CONSTRUCTORS = [
  { label: "hex('#')", insertText: "hex('#" },
  { label: 'px()', insertText: 'px(' },
  { label: 'rem()', insertText: 'rem(' },
  { label: 'ms()', insertText: 'ms(' },
];

export function setupAutocomplete(book: DesignBook) {
  const dropdown = document.createElement('div');
  dropdown.className = 'autocomplete-dropdown';
  dropdown.style.display = 'none';
  document.body.appendChild(dropdown);

  let activeInput: HTMLInputElement | null = null;
  let selectedIndex = -1;
  let currentSuggestions: Suggestion[] = [];
  let blurTimeout: ReturnType<typeof setTimeout> | null = null;
  // Track if we're in "pick argument" mode after choosing a function
  let pendingFunction: string | null = null;

  function getAllQualifiedKeys(): { key: string; color?: string }[] {
    const results: { key: string; color?: string }[] = [];
    for (const scope of book.getAllScopes()) {
      for (const tokenName of scope.getAllKeys()) {
        const qualifiedKey = `${scope.name}.${tokenName}`;
        let color: string | undefined;
        try {
          const resolved = book.resolve(qualifiedKey);
          if (resolved && (resolved.startsWith('#') || resolved.startsWith('rgb') || resolved.startsWith('hsl'))) {
            color = resolved;
          }
        } catch {
          // skip
        }
        results.push({ key: qualifiedKey, color });
      }
    }
    return results;
  }

  function computeSuggestions(input: string): Suggestion[] {
    const suggestions: Suggestion[] = [];
    const trimmed = input.trim();

    // If we're in "pick argument" mode (user just chose a function), show refs
    if (pendingFunction) {
      return getRefSuggestions('');
    }

    // Check if cursor is inside a function call needing a ref argument
    // e.g. "bestContrastWith(" or "colorMix(ref('brand.primary'), "
    const funcCallMatch = trimmed.match(/^(\w+)\((.*)$/);
    if (funcCallMatch && FUNCTION_NAMES.includes(funcCallMatch[1])) {
      const argsStr = funcCallMatch[2];
      // If we're at a position where a ref would go, suggest refs
      // Simple heuristic: if the args string ends with empty, comma+space, or starts ref('
      const lastArgStart = argsStr.lastIndexOf(',');
      const currentArg = lastArgStart >= 0 ? argsStr.slice(lastArgStart + 1).trim() : argsStr.trim();

      // Inside ref('...')
      const refMatch = currentArg.match(/^ref\(\s*['"](.*)/);
      if (refMatch) {
        const partial = refMatch[1].replace(/['"].*$/, '');
        return getRefSuggestions(partial);
      }

      // Empty arg position — suggest refs
      if (currentArg === '' || currentArg === 'ref(') {
        return getRefSuggestions('');
      }

      // Partial text at arg position
      return getRefSuggestions(currentArg);
    }

    // Inside ref('...')
    const refMatch = trimmed.match(/^ref\(\s*['"](.*)/);
    if (refMatch) {
      const partial = refMatch[1].replace(/['"].*$/, '');
      return getRefSuggestions(partial);
    }

    const lowerTrimmed = trimmed.toLowerCase();

    // References
    const allKeys = getAllQualifiedKeys();
    for (const { key, color } of allKeys) {
      if (!trimmed || key.toLowerCase().includes(lowerTrimmed)) {
        suggestions.push({
          label: `ref('${key}')`,
          insertText: `ref('${key}')`,
          group: 'References',
          swatchColor: color,
        });
      }
    }

    // Functions
    for (const fn of FUNCTION_NAMES) {
      if (!trimmed || fn.toLowerCase().includes(lowerTrimmed)) {
        suggestions.push({
          label: fn + '(...)',
          insertText: `${fn}(`,
          group: 'Functions',
        });
      }
    }

    // Value constructors
    for (const vc of VALUE_CONSTRUCTORS) {
      if (!trimmed || vc.label.toLowerCase().includes(lowerTrimmed)) {
        suggestions.push({
          label: vc.label,
          insertText: vc.insertText,
          group: 'Values',
        });
      }
    }

    return suggestions;
  }

  function getRefSuggestions(partial: string): Suggestion[] {
    const suggestions: Suggestion[] = [];
    const allKeys = getAllQualifiedKeys();
    const lower = partial.toLowerCase();
    for (const { key, color } of allKeys) {
      if (!partial || key.toLowerCase().includes(lower)) {
        suggestions.push({
          label: key,
          insertText: key, // will be wrapped in ref() by acceptSuggestion
          group: 'References',
          swatchColor: color,
        });
      }
    }
    return suggestions;
  }

  function renderDropdown() {
    dropdown.innerHTML = '';

    if (currentSuggestions.length === 0) {
      dropdown.style.display = 'none';
      return;
    }

    let lastGroup = '';
    for (let i = 0; i < currentSuggestions.length; i++) {
      const s = currentSuggestions[i];

      if (s.group !== lastGroup) {
        lastGroup = s.group;
        const header = document.createElement('div');
        header.className = 'autocomplete-header';
        header.textContent = pendingFunction ? `Pick argument for ${pendingFunction}` : s.group;
        dropdown.appendChild(header);
      }

      const item = document.createElement('div');
      item.className = 'autocomplete-item';
      if (i === selectedIndex) {
        item.classList.add('selected');
      }

      if (s.swatchColor) {
        const swatch = document.createElement('span');
        swatch.className = 'autocomplete-swatch';
        swatch.style.background = s.swatchColor;
        item.appendChild(swatch);
      }

      const text = document.createElement('span');
      text.textContent = s.label;
      item.appendChild(text);

      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        acceptSuggestion(i);
      });

      dropdown.appendChild(item);
    }

    dropdown.style.display = 'block';
  }

  function positionDropdown(input: HTMLInputElement) {
    const rect = input.getBoundingClientRect();
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.top = `${rect.bottom + 2}px`;
    dropdown.style.width = `${Math.max(rect.width, 260)}px`;
  }

  function acceptSuggestion(index: number) {
    if (!activeInput || index < 0 || index >= currentSuggestions.length) return;
    const s = currentSuggestions[index];

    if (pendingFunction) {
      // We're picking an argument for a function — wrap in ref() and append to current value
      const refText = `ref('${s.insertText}')`;
      // Replace or append the ref to the current function call
      const currentVal = activeInput.value;
      // Find the function call opening
      const funcPrefix = `${pendingFunction}(`;
      if (currentVal.startsWith(funcPrefix)) {
        const argsStr = currentVal.slice(funcPrefix.length);
        const lastComma = argsStr.lastIndexOf(',');
        if (lastComma >= 0) {
          // Append after last comma
          activeInput.value = funcPrefix + argsStr.slice(0, lastComma + 1) + ' ' + refText;
        } else {
          // First argument
          activeInput.value = funcPrefix + refText;
        }
      } else {
        activeInput.value = funcPrefix + refText;
      }
      pendingFunction = null;
      hideDropdown();
      activeInput.focus();
      const len = activeInput.value.length;
      activeInput.setSelectionRange(len, len);
      return;
    }

    // Check if user picked a function — enter "pick argument" mode
    if (s.group === 'Functions') {
      activeInput.value = s.insertText; // e.g. "bestContrastWith("
      pendingFunction = s.insertText.replace('(', '');
      // Show ref suggestions for the argument
      positionDropdown(activeInput);
      currentSuggestions = getRefSuggestions('');
      selectedIndex = -1;
      renderDropdown();
      activeInput.focus();
      const len = activeInput.value.length;
      activeInput.setSelectionRange(len, len);
      return;
    }

    // Regular accept
    activeInput.value = s.insertText;
    pendingFunction = null;
    hideDropdown();
    activeInput.focus();
    const len = s.insertText.length;
    activeInput.setSelectionRange(len, len);

    // Trigger change if it's a complete value (not a partial like "px(")
    if (s.group === 'References' || (s.group === 'Values' && s.insertText.endsWith(')'))) {
      activeInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function hideDropdown() {
    dropdown.style.display = 'none';
    selectedIndex = -1;
    currentSuggestions = [];
    pendingFunction = null;
  }

  function showForInput(input: HTMLInputElement) {
    activeInput = input;
    pendingFunction = null;
    positionDropdown(input);
    currentSuggestions = computeSuggestions(input.value);
    selectedIndex = -1;
    renderDropdown();
  }

  // Event delegation
  document.addEventListener('focusin', (e) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('token-value') && target.tagName === 'INPUT') {
      showForInput(target as HTMLInputElement);
    }
  });

  document.addEventListener('input', (e) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('token-value') && target.tagName === 'INPUT') {
      activeInput = target as HTMLInputElement;
      pendingFunction = null; // reset on manual typing
      positionDropdown(activeInput);
      currentSuggestions = computeSuggestions(activeInput.value);
      selectedIndex = -1;
      renderDropdown();
    }
  });

  document.addEventListener('focusout', (e) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('token-value') && target.tagName === 'INPUT') {
      if (blurTimeout) clearTimeout(blurTimeout);
      blurTimeout = setTimeout(() => {
        hideDropdown();
      }, 200);
    }
  });

  document.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement;
    if (!target.classList.contains('token-value') || target.tagName !== 'INPUT') return;

    const input = target as HTMLInputElement;

    // Arrow down opens dropdown if closed
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (dropdown.style.display === 'none') {
        activeInput = input;
        positionDropdown(input);
        currentSuggestions = computeSuggestions(input.value);
        selectedIndex = 0;
        renderDropdown();
      } else {
        selectedIndex = Math.min(selectedIndex + 1, currentSuggestions.length - 1);
        renderDropdown();
        scrollSelectedIntoView();
      }
    } else if (e.key === 'ArrowUp') {
      if (dropdown.style.display !== 'none') {
        e.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        renderDropdown();
        scrollSelectedIntoView();
      }
    } else if (e.key === 'Enter') {
      if (dropdown.style.display !== 'none' && selectedIndex >= 0) {
        e.preventDefault();
        acceptSuggestion(selectedIndex);
      }
    } else if (e.key === 'Escape') {
      if (dropdown.style.display !== 'none') {
        e.preventDefault();
        hideDropdown();
      }
    }
  });

  function scrollSelectedIntoView() {
    const selected = dropdown.querySelector('.autocomplete-item.selected');
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }
}
