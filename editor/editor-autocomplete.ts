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
  // Create shared dropdown element
  const dropdown = document.createElement('div');
  dropdown.className = 'autocomplete-dropdown';
  dropdown.style.display = 'none';
  document.body.appendChild(dropdown);

  let activeInput: HTMLInputElement | null = null;
  let selectedIndex = -1;
  let currentSuggestions: Suggestion[] = [];
  let blurTimeout: ReturnType<typeof setTimeout> | null = null;

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

    // Check if user is inside ref('...')
    const refMatch = trimmed.match(/^ref\(\s*['"](.*)/);
    if (refMatch) {
      const partial = refMatch[1].replace(/['"].*$/, '');
      const allKeys = getAllQualifiedKeys();
      for (const { key, color } of allKeys) {
        if (!partial || key.toLowerCase().includes(partial.toLowerCase())) {
          suggestions.push({
            label: key,
            insertText: `ref('${key}')`,
            group: 'References',
            swatchColor: color,
          });
        }
      }
      return suggestions;
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
          label: fn,
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

  function renderDropdown() {
    dropdown.innerHTML = '';

    if (currentSuggestions.length === 0) {
      dropdown.style.display = 'none';
      return;
    }

    let lastGroup = '';
    for (let i = 0; i < currentSuggestions.length; i++) {
      const s = currentSuggestions[i];

      // Group header
      if (s.group !== lastGroup) {
        lastGroup = s.group;
        const header = document.createElement('div');
        header.className = 'autocomplete-header';
        header.textContent = s.group;
        dropdown.appendChild(header);
      }

      const item = document.createElement('div');
      item.className = 'autocomplete-item';
      if (i === selectedIndex) {
        item.classList.add('selected');
      }

      // Color swatch
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
        e.preventDefault(); // prevent blur
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
    dropdown.style.width = `${Math.max(rect.width, 220)}px`;
  }

  function acceptSuggestion(index: number) {
    if (!activeInput || index < 0 || index >= currentSuggestions.length) return;
    const s = currentSuggestions[index];
    activeInput.value = s.insertText;
    hideDropdown();

    // Place cursor at end or inside parens
    activeInput.focus();
    const len = s.insertText.length;
    activeInput.setSelectionRange(len, len);

    // Trigger change event
    activeInput.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function hideDropdown() {
    dropdown.style.display = 'none';
    selectedIndex = -1;
    currentSuggestions = [];
    activeInput = null;
  }

  function showForInput(input: HTMLInputElement) {
    activeInput = input;
    positionDropdown(input);
    currentSuggestions = computeSuggestions(input.value);
    selectedIndex = -1;
    renderDropdown();
  }

  // Use event delegation on document
  document.addEventListener('focusin', (e) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('token-value') && target.tagName === 'INPUT') {
      showForInput(target as HTMLInputElement);
    }
  });

  document.addEventListener('input', (e) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('token-value') && target.tagName === 'INPUT') {
      if (activeInput !== target) {
        activeInput = target as HTMLInputElement;
      }
      positionDropdown(activeInput);
      currentSuggestions = computeSuggestions(activeInput.value);
      selectedIndex = -1;
      renderDropdown();
    }
  });

  document.addEventListener('focusout', (e) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('token-value') && target.tagName === 'INPUT') {
      // Delay to allow click on dropdown item
      if (blurTimeout) clearTimeout(blurTimeout);
      blurTimeout = setTimeout(() => {
        hideDropdown();
      }, 150);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (!activeInput || dropdown.style.display === 'none') return;
    if (!activeInput.classList.contains('token-value')) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, currentSuggestions.length - 1);
      renderDropdown();
      scrollSelectedIntoView();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      renderDropdown();
      scrollSelectedIntoView();
    } else if (e.key === 'Enter') {
      if (selectedIndex >= 0) {
        e.preventDefault();
        acceptSuggestion(selectedIndex);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      hideDropdown();
    }
  });

  function scrollSelectedIntoView() {
    const selected = dropdown.querySelector('.autocomplete-item.selected');
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }
}
