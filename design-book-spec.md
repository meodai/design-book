# Design Book Specification

## Table of Contents

1. [Overview](#overview)
2. [Core Architecture](#core-architecture)
   - [DesignBook Class](#designbook-class)
   - [Scope Class](#scope-class)
   - [Token Value Types](#token-value-types)
   - [Reference Resolution and Caching System](#reference-resolution-and-caching-system)
   - [Function System](#function-system-with-optimized-reference-resolution)
   - [Scope Management](#scope-management)
   - [Dependency Management](#dependency-management)
3. [Renderer System](#renderer-system)
   - [Renderer Extensibility](#renderer-extensibility)
4. [Extensibility](#extensibility)
5. [Usage Examples](#usage-examples)
6. [Event System](#event-system)
7. [Error Handling Strategy](#error-handling-strategy)
8. [Testing and Validation](#testing-and-validation)
9. [Key Features](#key-features)

## Overview

A reactive TypeScript design system based on DesignBook that supports nested token definitions, dynamic calculations, and multiple output formats. It is designed for design systems that need to maintain relationships between tokens across different platforms and tools.

## Core Architecture

### DesignBook Class

The `DesignBook` class is the central orchestrator that manages scopes, token definitions, dependencies, and rendering. It uses a `ScopeManager` internally to handle scope-related operations.

It operates in two modes:

- **`auto` (default):** All changes are processed and propagated immediately. This is ideal for interactive use cases where immediate feedback is important.
- **`batch`:** Changes are queued and processed only when `flush()` is called. This is more performant for large-scale, non-interactive operations such as builds or rendering.

```typescript
export class DesignBook {
  constructor(name: string, options: { mode?: 'auto' | 'batch'; description?: string } = {})
  
  // Scope Management
  addScope(name: string, options?: { extends?: string; description?: string }): Scope // Adds a new scope. No overrides.
  extendScope(name: string, baseScope: string, description?: string): Scope // Creates a new scope based on an existing one. No overrides parameter.
  copyScope(sourceName: string, targetName: string): Scope
  deleteScope(name: string): void
  getScope(name: string): Scope | undefined
  hasScope(name: string): boolean // Check if a scope exists without retrieving it
  getAllScopes(): Array<{ name: string; config: ScopeConfig }>
  getAllKeysForScope(scopeName: string): string[] // Returns all keys for a scope, including inherited keys from extended scopes
  getScopeDependencies(scopeName: string): string[] // Returns external keys that tokens in this scope depend on

  // Global token operations
  resolve(key: string): string
  has(key: string): boolean

  // Custom Function Registration
  registerFunction(name: string, implementation: (...args: any[]) => string): void

  // Processing mode — can be switched at runtime
  mode: 'auto' | 'batch' // Get or set the current processing mode

  // Batch Operations
  flush(): void
  batchQueueSize: number // Number of pending updates in batch mode (0 in auto mode)

  // Event System
  on(event: string, callback: EventListener): void
  watch(key: string, callback: (newValue: string, oldValue?: string) => void): void

  // Dependency Analysis
  getDependencyGraph(): DependencyGraph
}
```

### Scope Class

A `Scope` represents a collection of related tokens (colors, typography, spacing, etc.) with support for inheritance and dynamic calculations.

`getAllKeys()` returns all token keys in the scope, **including keys inherited** from a parent scope via `extends`. This means an extended scope will list both its own keys and any keys it inherits that it hasn't overridden.

```typescript
export class Scope {
  constructor(name: string, book: DesignBook, options?: ScopeOptions)

  // Token management
  set(name: string, value: TokenValue): void
  get(name: string): TokenValue | undefined
  resolve(name: string): string
  has(name: string): boolean
  allTokens(): Record<string, TokenValue>
  getAllKeys(): string[] // Includes inherited keys from parent scope
  
  // Reference management
  private referenceResolver: ReferenceResolver
  
  // Update reference cache when token changes
  private updateReferenceCaches(key: string): void {
    this.referenceResolver.updateAllReferencesTo(key);
  }
  
  // Override set to trigger reference updates
  set(name: string, value: TokenValue): void {
    const oldValue = this.get(name);
    // ... set logic ...
    
    // Update reference caches if value changed
    if (oldValue !== value) {
      this.updateReferenceCaches(name);
    }
  }
}
```

### Token Value Types

```typescript
// Core token value format with val() wrapper
interface TokenValue {
  type: 'color' | 'dimension';
  rawValue: string | number;
  processors?: Array<{
    name: string;
    instance: any;
  }>;
  description?: string;
  metadata?: {
    unit?: string;
    colorSpace?: string;
    validated?: boolean;
    [key: string]: any;
  };
}

// Reference is its own separate type (just a pointer) with cached resolution metadata
interface ReferenceValue {
  type: 'reference';
  key: string; // Points to a token or scope
  description?: string;
  resolvedType?: 'color' | 'dimension' | 'function'; // Cached type of resolved value
  resolvedMetadata?: {
    isResolvable?: boolean;
    lastResolvedAt?: number;
    errorMessage?: string;
    [key: string]: any;
  };
}

// Function token (complex operations) with options
interface FunctionTokenValue {
  type: 'function';
  rawValue: string; // function name
  implementation: (...args: any[]) => string;
  args: (TokenValue | ReferenceValue | Scope | number | string)[];
  processors?: Array<{
    name: string;
    instance: any;
  }>;
  description?: string;
  options?: Record<string, any>; // Function-specific options (ratio, colorSpace, etc.)
  metadata?: {
    // `dependencies` are direct inputs for value calculation.
    // A change in a dependency will mark this token as needing re-computation.
    dependencies: string[];
    // `visualDependencies` are used by tools (e.g., SVGRenderer) to show relationships,
    // but they don't affect the token's resolved value.
    visualDependencies: string[];
    acceptedTypes?: string[][]; // What types this function can work with
    returnType?: 'color' | 'dimension' | 'reference'; // Functions return actual value types
    [key: string]: any;
  };
}

// Union type for all possible token values
type AnyTokenValue = TokenValue | ReferenceValue | FunctionTokenValue;

// Universal val() wrapper for all value types
export function val<T>(value: T, options?: { description?: string; [key: string]: any }): T & { description?: string } {
  if (typeof value === 'object' && value !== null) {
    return {
      ...value,
      description: options?.description,
      ...options
    };
  }
  return value as T & { description?: string };
}

// Utility functions for creating token values
export function hex(value: string, options?: { description?: string; [key: string]: any }): TokenValue {
  try {
    const parsed = parse(value);
    if (!parsed) throw new Error(`Invalid color: ${value}`);
    
    return val({
      type: 'color',
      rawValue: value,
      processors: [{
        name: 'culori',
        instance: parsed
      }],
      metadata: {
        colorSpace: 'srgb',
        validated: true
      }
    }, options);
  } catch (e) {
    return val({
      type: 'color',
      rawValue: value,
      metadata: {
        validated: false
      }
    }, options);
  }
}

export function ref(key: string, options?: { description?: string; [key: string]: any }): ReferenceValue {
  return val({
    type: 'reference',
    key: key,
    resolvedType: undefined, // Will be populated on first resolution
    resolvedMetadata: {
      isResolvable: undefined,
      lastResolvedAt: undefined
    }
  }, options);
}

export function px(value: number, options?: { description?: string; [key: string]: any }): TokenValue {
  return val({
    type: 'dimension',
    rawValue: value,
    metadata: {
      unit: 'px',
      validated: true
    }
  }, options);
}

export function rem(value: number, options?: { description?: string; [key: string]: any }): TokenValue {
  return val({
    type: 'dimension',
    rawValue: value,
    metadata: {
      unit: 'rem',
      validated: true
    }
  }, options);
}

// Color function helpers return function type tokens with options support
export function bestContrastWith(
  targetValue: TokenValue | ReferenceValue, 
  scope: Scope,
  options?: { description?: string; [key: string]: any }
): FunctionTokenValue {
  return val({
    type: 'function',
    rawValue: 'bestContrastWith',
    implementation: bestContrastWithImpl,
    args: [targetValue, scope],
    processors: [{
      name: 'culori',
      instance: bestContrastWithImpl
    }],
    options: options ? { ...options } : {},
    metadata: {
      dependencies: extractDependencies([targetValue, scope]),
      visualDependencies: extractVisualDependencies([targetValue, scope]),
      acceptedTypes: [['color', 'reference']], // First arg can be color or reference
      returnType: 'color'
    }
  }, options);
}

export function colorMix(
  color1: TokenValue | ReferenceValue, 
  color2: TokenValue | ReferenceValue,
  scope: Scope,
  options?: { 
    ratio?: number;
    colorSpace?: string;
    description?: string;
    [key: string]: any;
  }
): FunctionTokenValue {
  const { ratio = 0.5, colorSpace = 'lab', ...otherOptions } = options || {};
  
  return val({
    type: 'function',
    rawValue: 'colorMix',
    implementation: colorMixImpl,
    args: [color1, color2, ratio, colorSpace, scope],
    processors: [{
      name: 'culori',
      instance: colorMixImpl
    }],
    options: { ratio, colorSpace, ...otherOptions },
    metadata: {
      dependencies: extractDependencies([color1, color2]),
      visualDependencies: extractVisualDependencies([color1, color2]),
      acceptedTypes: [['color', 'reference'], ['color', 'reference'], ['number'], ['string'], ['scope']],
      returnType: 'color',
      colorSpace: colorSpace
    }
  }, options);
}

export function spacingScale(
  baseValue: TokenValue | ReferenceValue,
  scope: Scope,
  options?: { 
    multiplier?: number;
    description?: string;
    [key: string]: any;
  }
): FunctionTokenValue {
  const { multiplier = 1, ...otherOptions } = options || {};
  
  return val({
    type: 'function',
    rawValue: 'spacingScale',
    implementation: spacingScaleImpl,
    args: [baseValue, multiplier, scope],
    options: { multiplier, ...otherOptions },
    metadata: {
      dependencies: extractDependencies([baseValue]),
      visualDependencies: extractVisualDependencies([baseValue]),
      acceptedTypes: [['dimension', 'reference'], ['number'], ['scope']],
      returnType: 'dimension'
    }
  }, options);
}
```

### Reference Resolution and Caching System

The reference resolution system is designed for performance and resilience. When a token's value is changed, the system intelligently updates the metadata of any tokens that reference it. This ensures that information about whether a reference is resolvable and what type of value it points to is always up-to-date, preventing unnecessary re-computation.

If a token reference cannot be resolved (e.g., it points to a non-existent token or resolving it would cause an error), its metadata is updated with an error message. Any attempt to `resolve()` a token with an unresolvable reference will throw an error by default, ensuring that dependency issues are caught early.

```typescript
export class ReferenceResolver {
  private book: DesignBook;
  
  constructor(book: DesignBook) {
    this.book = book;
  }
  
  // Update reference metadata when referenced token changes
  updateReferenceMetadata(ref: ReferenceValue): void {
    try {
      const resolved = this.book.resolve(ref.key);
      const resolvedToken = this.book.getTokenByKey(ref.key);
      
      ref.resolvedType = resolvedToken?.type;
      ref.resolvedMetadata = {
        isResolvable: true,
        lastResolvedAt: Date.now(),
        errorMessage: undefined
      };
    } catch (error) {
      ref.resolvedType = undefined;
      ref.resolvedMetadata = {
        isResolvable: false,
        lastResolvedAt: Date.now(),
        errorMessage: error.message
      };
    }
  }
  
  // Batch update all references to a specific key
  updateAllReferencesTo(key: string): void {
    const allReferences = this.book.getDependencyGraph().getDependentsOf(key);
    
    allReferences.forEach(refKey => {
      const token = this.book.getTokenByKey(refKey);
      if (token?.type === 'reference') {
        this.updateReferenceMetadata(token as ReferenceValue);
      }
      
      // Also update function tokens that contain references
      if (token?.type === 'function') {
        const functionToken = token as FunctionTokenValue;
        functionToken.args.forEach(arg => {
          if (typeof arg === 'object' && arg.type === 'reference' && arg.key === key) {
            this.updateReferenceMetadata(arg as ReferenceValue);
          }
        });
      }
    });
  }
  
  // Get cached type without resolution
  getCachedType(ref: ReferenceValue): 'color' | 'dimension' | 'function' | undefined {
    return ref.resolvedType;
  }
  
  // Check if reference is resolvable without actually resolving
  isResolvable(ref: ReferenceValue): boolean {
    return ref.resolvedMetadata?.isResolvable ?? false;
  }
}
```

```typescript
### Function System with Optimized Reference Resolution

```typescript
// Color functions can use cached reference metadata for efficiency
export function bestContrastWithImpl(targetValue: TokenValue | ReferenceValue, scope: Scope): string {
  let resolvedTarget: TokenValue;
  if (targetValue.type === 'reference') {
    // Check cached type first
    if (targetValue.resolvedType && targetValue.resolvedType !== 'color') {
      throw new Error(`bestContrastWith expects color type, got ${targetValue.resolvedType} (cached)`);
    }
    if (!targetValue.resolvedMetadata?.isResolvable) {
      throw new Error(`bestContrastWith cannot resolve reference '${targetValue.key}': ${targetValue.resolvedMetadata?.errorMessage}`);
    }
    resolvedTarget = scope.resolve(targetValue.key);
  } else {
    resolvedTarget = targetValue;
  }
  
  if (resolvedTarget.type !== 'color') {
    throw new Error(`bestContrastWith expects color type, got ${resolvedTarget.type}`);
  }
  
  const culoriProcessor = resolvedTarget.processors?.find(p => p.name === 'culori');
  const targetColor = culoriProcessor?.instance 
    ? formatHex(culoriProcessor.instance)
    : resolvedTarget.rawValue as string;
  
  let bestColor = '#000000';
  let bestContrast = 0;
  let foundValidColors = 0;
  
  for (const key of scope.getAllKeys()) {
    const candidateValue = scope.get(key);
    
    // Fast type checking using cached metadata
    if (candidateValue?.type === 'reference') {
      // Skip if cached type indicates it's not a color
      if (candidateValue.resolvedType && candidateValue.resolvedType !== 'color') continue;
      if (!candidateValue.resolvedMetadata?.isResolvable) continue;
    } else if (candidateValue?.type !== 'color') {
      continue;
    }
    
    // Only resolve if we know it's likely to be a color
    let resolvedCandidate: TokenValue;
    if (candidateValue.type === 'reference') {
      try {
        resolvedCandidate = scope.resolve(candidateValue.key);
        if (resolvedCandidate.type !== 'color') continue;
      } catch {
        continue;
      }
    } else {
      resolvedCandidate = candidateValue;
    }
    
    foundValidColors++;
    
    const candidateProcessor = resolvedCandidate.processors?.find(p => p.name === 'culori');
    const candidateColor = candidateProcessor?.instance
      ? formatHex(candidateProcessor.instance)
      : resolvedCandidate.rawValue as string;
    
    const contrast = wcagContrast(candidateColor, targetColor);
    if (contrast > bestContrast) {
      bestContrast = contrast;
      bestColor = candidateColor;
    }
  }
  
  if (foundValidColors === 0) {
    throw new Error(`bestContrastWith found no valid color tokens in scope '${scope.name}'`);
  }
  
  return bestColor;
}

// Optimized scope analysis using cached reference types
export function getColorTokensFromScope(scope: Scope): Array<{ key: string; value: TokenValue }> {
  const colorTokens: Array<{ key: string; value: TokenValue }> = [];
  
  for (const key of scope.getAllKeys()) {
    const token = scope.get(key);
    
    // Fast filtering using cached types
    if (token?.type === 'reference') {
      if (token.resolvedType !== 'color') continue;
      if (!token.resolvedMetadata?.isResolvable) continue;
      
      try {
        const resolved = scope.resolve(token.key);
        if (resolved.type === 'color') {
          colorTokens.push({ key, value: resolved });
        }
      } catch {
        continue;
      }
    } else if (token?.type === 'color') {
      colorTokens.push({ key, value: token });
    }
  }
  
  return colorTokens;
}

export function colorMixImpl(
  color1: TokenValue | ReferenceValue, 
  color2: TokenValue | ReferenceValue, 
  ratio = 0.5, 
  colorSpace = 'lab',
  scope: Scope
): string {
  const resolved1 = color1.type === 'reference' ? scope.resolve(color1.key) : color1;
  const resolved2 = color2.type === 'reference' ? scope.resolve(color2.key) : color2;
  
  if (resolved1.type !== 'color' || resolved2.type !== 'color') {
    throw new Error('colorMix expects color types for first two arguments');
  }
  
  try {
    const processor1 = resolved1.processors?.find(p => p.name === 'culori');
    const processor2 = resolved2.processors?.find(p => p.name === 'culori');
    
    const parsed1 = processor1?.instance || parse(resolved1.rawValue as string);
    const parsed2 = processor2?.instance || parse(resolved2.rawValue as string);
    
    if (!parsed1 || !parsed2) return resolved1.rawValue as string;
    
    const interpolator = interpolate([parsed1, parsed2], colorSpace);
    return formatHex(interpolator(ratio));
  } catch (e) {
    return resolved1.rawValue as string;
  }
}

export function spacingScaleImpl(baseValue: TokenValue | ReferenceValue, multiplier: number, scope: Scope): string {
  const resolved = baseValue.type === 'reference' ? scope.resolve(baseValue.key) : baseValue;
  
  if (resolved.type !== 'dimension') {
    throw new Error(`spacingScale expects dimension type, got ${resolved.type}`);
  }
  
  const value = resolved.rawValue as number;
  const unit = resolved.metadata?.unit || 'px';
  return `${value * multiplier}${unit}`;
}
```

### Scope Management

```typescript
export class ScopeManager {
  addScope(name: string, options?: { extends?: string; description?: string }): Scope // Only adds a new scope. No overrides.
  extendScope(name: string, baseScope: string, description?: string): Scope // Creates a new scope based on an existing one. No overrides param.
  copyScope(sourceName: string, targetName: string): Scope
  deleteScope(name: string): string[]
  hasScope(name: string): boolean
  getAllKeysForScope(scopeName: string): string[] // Includes inherited keys
  getScopeDependencies(scopeName: string): string[] // External keys this scope's tokens depend on
}
```

### Dependency Management

The dependency graph is a critical component for managing the complex relationships between tokens. It tracks which tokens depend on others, which allows for efficient and accurate propagation of changes.

Crucially, the dependency graph is responsible for detecting and preventing circular dependencies. When a new token or reference is added that would create a cycle (e.g., `tokenA` references `tokenB`, and `tokenB` references `tokenA`), the operation will fail with an error. This prevents infinite loops during resolution and ensures the stability of the design system.

```typescript
export class DependencyGraph {
  // Basic dependency operations
  getPrerequisitesFor(key: string): string[]
  getDependentsOf(key: string): string[]
  getEvaluationOrderFor(startKey: string): string[]
  topologicalSort(keysToSort: string[]): string[]
  
  // Graph traversal algorithms
  dfsTraversal(startNode: string, visitPrerequisites?: boolean): string[]
  bfsTraversal(startNode: string, visitPrerequisites?: boolean): string[]
  findShortestPath(fromNode: string, toNode: string, traverseUpstream?: boolean): string[] | null
  hasPath(fromNode: string, toNode: string, traverseUpstream?: boolean): boolean
  
  // Graph analysis
  hasCycles(): boolean
  getAllNodes(): string[]
  getNodeDegree(node: string, incoming?: boolean): number
}
```

## Renderer System

### ColorRenderer with Format-Specific Function Renderers

```typescript
export type RenderFormat = 'css-variables' | 'json' | 'w3-design-tokens';

export class ColorRenderer {
  constructor(book: DesignBook, format: RenderFormat = 'css-variables')
  
  render(): string
  registerFunctionRenderer(functionName: string, renderer: FunctionRenderer): void
}

// Function renderers provide format-specific output
export const colorMixRenderers: Record<string, FunctionRenderer> = {
  'css-variables': (args: any[], options?: any): string => {
    const [color1, color2] = args;
    const ratio = options?.ratio || 0.5;
    const colorSpace = options?.colorSpace || 'lab';
    const percentage = Math.round(ratio * 100);
    return `color-mix(in ${colorSpace}, ${color1} ${100 - percentage}%, ${color2})`;
  },
  
  'json': (_args: any[], _options?: any): string => {
    return ''; // Resolve to computed value
  },
  
  'w3-design-tokens': (_args: any[], _options?: any): string => {
    return ''; // Resolve to computed value for W3 format
  }
};
```

### SVGRenderer for Visualizations

```typescript
export class SVGRenderer extends ColorRenderer {
  constructor(book: DesignBook, options?: SVGRenderOptions)
  
  render(): string // Returns SVG visualization of color relationships
}
```

## Extensibility

To ensure the design system is adaptable to any project's needs, it supports custom extensions. You can register your own functions and even define custom token types.

### Registering Custom Functions

You can add new functions to the `DesignBook` instance to perform custom calculations or transformations. This allows you to encapsulate project-specific logic directly into your design system.

```typescript
// 1. Define the function implementation
const addExclamationImpl = (text: string): string => `${text}!`;

// 2. Register it with the DesignBook instance
book.registerFunction('addExclamation', addExclamationImpl);

// 3. Use it in your token definitions
const scope = book.addScope('custom');
scope.set('greeting', { type: 'string', rawValue: 'Hello' });
scope.set('excitedGreeting', {
  type: 'function',
  rawValue: 'addExclamation',
  args: [ref('greeting')]
});

// Resolves to "Hello!"
const result = book.resolve('custom.excitedGreeting');
```

### Defining Custom Token Types

While the system provides core types like `color` and `dimension`, you can introduce your own custom types. This is done by convention: define an object with a `type` and `rawValue`, and ensure that any functions that consume this type know how to process it.

```typescript
// Define a custom shadow token
const shadowToken = {
  type: 'shadow',
  rawValue: '0px 4px 8px rgba(0,0,0,0.1)',
  description: 'A standard card shadow'

ui.set('card-shadow', shadowToken);

// You would then need a custom renderer or function that knows
// how to interpret the 'shadow' type.
```

## Usage Examples

### Basic Setup

```typescript
const book = new DesignBook('my-design-system');

// Create scopes
const brand = book.addScope('brand');
const semantic = book.addScope('semantic');

// Define base values
brand.set('primary', hex('#0066cc'));
brand.set('spacing-unit', px(8));

// Use references
semantic.set('background', ref('brand.primary'));

// Functions with options
semantic.set('text', bestContrastWith(ref('semantic.background'), brand));

semantic.set('hover', colorMix(
  hex('#0066cc'), 
  ref('brand.primary'),
  semantic,
  { ratio: 0.1, colorSpace: 'lab' }
));
```

### Comprehensive Token System

```typescript
const brand = book.addScope('brand');
const ui = book.addScope('ui');

// Base colors
brand.set('primary', hex('#0066cc'));
brand.set('neutral-dark', hex('#1a1a1a'));
brand.set('neutral-light', hex('#ffffff'));
brand.set('success', hex('#28a745'));
brand.set('warning', hex('#ffc107'));
brand.set('error', hex('#dc3545'));

// Spacing system
brand.set('space-xs', px(4));
brand.set('space-sm', px(8));
brand.set('space-md', px(16));
brand.set('space-lg', px(24));
brand.set('space-xl', px(32));

// UI tokens using references
ui.set('button-bg', ref('brand.primary'));
ui.set('button-text', ref('brand.neutral-light'));

// Complex functions with options
ui.set('button-hover', colorMix(
  ref('brand.primary'),
  hex('#000000'),
  ui,
  { ratio: 0.1, colorSpace: 'oklch' }
));

ui.set('success-text', bestContrastWith(ref('brand.success'), brand));

// Typography scale
ui.set('text-xs', rem(0.75));
ui.set('text-sm', rem(0.875));
ui.set('text-base', rem(1));
ui.set('text-lg', rem(1.125));
ui.set('text-xl', rem(1.25));

// Advanced color relationships
ui.set('surface-subtle', colorMix(
  ref('brand.neutral-light'),
  ref('brand.primary'),
  { ratio: 0.02, colorSpace: 'lab' }
));

ui.set('error-surface', colorMix(
  ref('brand.error'),
  ref('brand.neutral-light'),
  { ratio: 0.1, colorSpace: 'lab' }
));

// Scope-based color selection (automatically filters for color tokens)
ui.set('accent-color', closestColor(hex('#ff6600'), brand)); // Finds closest brand color
ui.set('contrast-color', furthestFrom(brand)); // Finds most contrasting color in brand scope

// Relative color modifications
ui.set('primary-complement', relativeTo(ref('brand.primary'), 'oklch', [null, null, "+180"], ui));
ui.set('primary-muted', relativeTo(ref('brand.primary'), 'oklch', [null, "*0.5", null], ui));
ui.set('primary-light', relativeTo(ref('brand.primary'), 'oklch', ["+0.2", null, null], ui));

// Minimum contrast (AA-compliant but not maximized)
ui.set('subtle-text', minContrastWith(ref('brand.neutral-light'), brand, { ratio: 4.5 }));

// Spacing with multipliers
ui.set('large-spacing', spacingScale(ref('brand.space-md'), ui, { multiplier: 2 }));

// Typography scale
ui.set('heading-lg', typographyScale(ref('brand.space-md'), ui, { ratio: 1.25, step: 3 }));
```

### Metadata and Documentation

```typescript
// Values with rich descriptions for documentation
brand.set('primary', hex('#0066cc', {
  description: 'Primary brand color used for buttons and links'
}));

brand.set('spacing-unit', px(8, {
  description: 'Base spacing unit - all spacing should be multiples of this'
}));

// References with context
semantic.set('background', ref('brand.primary', {
  description: 'Uses brand primary as semantic background'
}));

// Functions with detailed explanations
semantic.set('text', bestContrastWith(
  ref('semantic.background', {
    description: 'The background color we need contrast against'
  }), 
  brand,
  {
    description: 'Automatically selects the best contrasting text color for accessibility'
  }
));

semantic.set('hover', colorMix(
  hex('#0066cc'), 
  ref('brand.primary'),
  semantic,
  {
    ratio: 0.1,
    colorSpace: 'lab',
    description: 'Subtle hover effect by mixing base with primary in LAB color space'
  }
));

// Access descriptions and metadata
console.log(brand.get('primary')?.description);
// "Primary brand color used for buttons and links"

const hoverToken = ui.get('button-hover') as FunctionTokenValue;
console.log(hoverToken.description);
console.log(hoverToken.options); // { ratio: 0.1, colorSpace: 'oklch' }

// Generate documentation from metadata
function generateTokenDocs(scope: Scope): string {
  return scope.getAllKeys()
    .map(key => {
      const token = scope.get(key);
      const resolved = scope.resolve(key);
      const optionsStr = token?.options ? ` (${JSON.stringify(token.options)})` : '';
      return `**${key}**: \`${resolved}\`${optionsStr} - ${token?.description || 'No description'}`;
    })
    .join('\n');
}
```

### Scope Inheritance

```typescript
// Create base theme
const light = book.addScope('light');
light.set('background', hex('#ffffff'));
light.set('surface', hex('#f5f5f5'));
light.set('primary', hex('#0066cc'));

// Create dark theme extending light
const dark = book.addScope('dark', { extends: 'light' });
dark.set('background', hex('#1a1a1a'));
dark.set('surface', hex('#2d2d2d'));

// dark.primary automatically inherits from light.primary
// dark.background and dark.surface use overridden values
```

### Advanced Functions with Options

```typescript
// Contrast-based selection
ui.set('text-on-primary', bestContrastWith(ref('brand.primary'), brand));

// Modern CSS color mixing with specific options
ui.set('primary-hover', colorMix(
  ref('brand.primary'),
  hex('#000000'),
  { ratio: 0.1, colorSpace: 'oklch' }
));

// Spacing functions with multiplier
ui.set('section-spacing', spacingScale(
  ref('brand.space-md'),
  ui,
  { multiplier: 3 }
));

// Custom functions with options
function customLighten(
  color: TokenValue | ReferenceValue,
  options?: {
    amount?: number;
    colorSpace?: string;
    description?: string;
  }
): FunctionTokenValue {
  const { amount = 0.1, colorSpace = 'oklch', ...otherOptions } = options || {};
  
  return val({
    type: 'function',
    rawValue: 'customLighten',
    implementation: customLightenImpl,
    args: [color, amount, colorSpace],
    options: { amount, colorSpace, ...otherOptions },
    metadata: {
      dependencies: color.type === 'reference' ? [color.key] : [],
      acceptedTypes: [['color', 'reference'], ['number'], ['string']],
      returnType: 'color'
    }
  }, options);
}

ui.set('light-primary', customLighten(ref('brand.primary'), {
  amount: 0.2,
  colorSpace: 'oklch'
}));
```

### Rendering

```typescript
// CSS Variables output
const cssRenderer = new ColorRenderer(book, 'css-variables');
console.log(cssRenderer.render());
/* Output:
:root {
  --brand-primary: #0066cc;
  --semantic-background: var(--brand-primary);
  --semantic-text: #ffffff;
  --semantic-hover: color-mix(in lab, #0066cc 90%, #0066cc);
  --ui-button-hover: color-mix(in oklch, var(--brand-primary) 90%, #000000);
}
*/

// JSON output with resolved values
const jsonRenderer = new ColorRenderer(book, 'json');
console.log(jsonRenderer.render());
/* Output:
{
  "brand.primary": "#0066cc",
  "semantic.background": "#0066cc",
  "semantic.text": "#ffffff",
  "semantic.hover": "#005cb3"
}
*/

// W3 Design Tokens format
const w3Renderer = new ColorRenderer(book, 'w3-design-tokens');
console.log(w3Renderer.render());
/* Output:
{
  "brand": {
    "primary": {
      "value": "#0066cc",
      "type": "color"
    }
  },
  "semantic": {
    "background": {
      "value": "{brand.primary}",
      "type": "color"
    }
  }
}
*/

// SVG visualization
const svgRenderer = new SVGRenderer(book);
const visualization = svgRenderer.render();
```

### Reactive Updates

```typescript
// Listen for changes
book.on('change', (event) => {
  const changes = event.detail;
  console.log('Tokens updated:', changes);
});

// Watch specific tokens
book.watch('brand.primary', (newValue, oldValue) => {
  console.log(`Primary color changed from ${oldValue} to ${newValue}`);
});

// Update base color - all dependents update automatically
brand.set('primary', hex('#0088ff'));
```

### Batch Processing

```typescript
// Mode can be switched at runtime between auto and batch
book.mode = 'batch';

// Queue multiple updates
brand.set('primary', hex('#0088ff'));
brand.set('secondary', hex('#ff8800'));
brand.set('accent', colorMix(
  ref('brand.primary'),
  ref('brand.secondary'),
  { ratio: 0.3, colorSpace: 'oklch' }
));

console.log(book.batchQueueSize); // 3

// Listen for batch completion
book.on('batch-complete', (event) => {
  console.log(`Processed ${event.detail.totalProcessed} updates`);
});

book.on('batch-failed', (event) => {
  console.error('Batch errors:', event.detail.errors);
});

// Process all updates in optimal dependency order
book.flush();

// Switch back to auto mode for interactive use
book.mode = 'auto';
```

### Dependency Analysis

```typescript
const graph = book.getDependencyGraph();

// Find what depends on a token
const dependents = graph.getDependentsOf('brand.primary');
console.log('Tokens that depend on brand.primary:', dependents);

// Find dependency chain
const chain = graph.dfsTraversal('semantic.text', true);
console.log('Dependency chain for semantic.text:', chain);

// Detect circular dependencies
if (graph.hasCycles()) {
  console.warn('Circular dependencies detected!');
}

// Find shortest path between tokens
const path = graph.findShortestPath('brand.primary', 'ui.final-color');
if (path) {
  console.log('Dependency path:', path.join(' → '));
}
```

## Built-in Functions

### Color Functions (use Culori)

#### Contrast Functions

##### `bestContrastWith(targetValue, scope, options?)`

Finds the color with the highest WCAG contrast ratio against the target from all color tokens in the given scope. Iterates all keys in the scope, filters to color tokens (using cached reference types for performance), and returns the hex value of the best match.

```typescript
export function bestContrastWith(
  targetValue: TokenValue | ReferenceValue,
  scope: Scope,
  options?: { description?: string; [key: string]: any }
): FunctionTokenValue
```

- If the scope contains no valid color tokens, throws a `FunctionError`.
- Uses WCAG 2.1 contrast ratio calculation.

##### `minContrastWith(targetValue, scope, options?)`

Finds a color from the scope that meets a minimum WCAG contrast ratio against the target. Unlike `bestContrastWith` which returns the highest contrast, this returns the color closest to (but still meeting) the specified ratio threshold — useful when you want sufficient contrast without maximizing it (e.g., avoiding pure black/white).

```typescript
export function minContrastWith(
  targetValue: TokenValue | ReferenceValue,
  scope: Scope,
  options?: {
    ratio?: number;       // Minimum WCAG contrast ratio (default: 4.5, i.e. AA for normal text)
    description?: string;
    [key: string]: any;
  }
): FunctionTokenValue
```

- Iterates all color tokens in the scope, filters to those meeting the minimum ratio.
- From qualifying colors, returns the one with the **lowest** contrast (closest to the threshold).
- If no color meets the minimum, falls back to the color with the **highest** contrast ratio (same as `bestContrastWith`).
- Common ratio values: `3.0` (AA large text), `4.5` (AA normal text), `7.0` (AAA normal text).

```typescript
// Example: find a brand color that meets AA contrast on white
ui.set('accessible-text', minContrastWith(
  hex('#ffffff'),
  brand,
  { ratio: 4.5 }
));
```

#### Color Manipulation

##### `colorMix(color1, color2, options?)`

Mixes two colors via interpolation in a specified color space. Uses Culori's `interpolate` function internally.

```typescript
export function colorMix(
  color1: TokenValue | ReferenceValue,
  color2: TokenValue | ReferenceValue,
  scope: Scope,
  options?: {
    ratio?: number;       // 0-1, default 0.5. 0 = 100% color1, 1 = 100% color2
    colorSpace?: string;  // default 'lab'. Supports: lab, lch, oklch, rgb, hsl, a98-rgb, etc.
    description?: string;
    [key: string]: any;
  }
): FunctionTokenValue
```

- CSS renderer outputs: `color-mix(in ${colorSpace}, ${color1} ${100 - percentage}%, ${color2})`
- JSON/W3 renderers resolve to computed hex value.

##### `lighten(color, options?)`

Increases the lightness of a color in HSL space.

```typescript
export function lighten(
  color: TokenValue | ReferenceValue,
  scope: Scope,
  options?: {
    amount?: number;      // 0-1, how much to lighten (default 0.1)
    description?: string;
    [key: string]: any;
  }
): FunctionTokenValue
```

- CSS renderer outputs: `color-mix(in oklch, ${color} ${100 - percentage}%, white)`

##### `darken(color, options?)`

Decreases the lightness of a color in HSL space. Clamped to minimum lightness of 0.

```typescript
export function darken(
  color: TokenValue | ReferenceValue,
  scope: Scope,
  options?: {
    amount?: number;      // 0-1, how much to darken (default 0.1)
    description?: string;
    [key: string]: any;
  }
): FunctionTokenValue
```

- CSS renderer outputs: `color-mix(in oklch, ${color} ${100 - percentage}%, black)`

##### `relativeTo(baseColor, colorSpace, modifications, options?)`

Applies relative modifications to individual color channels. This is one of the most powerful color functions — it allows precise adjustments in any supported color space without manually parsing and reconstructing colors.

```typescript
export function relativeTo(
  baseColor: TokenValue | ReferenceValue,
  colorSpace: string,    // oklch, hsl, lab, a98-rgb, etc.
  modifications: (null | number | string)[],  // One entry per channel in the color space
  scope: Scope,
  options?: {
    description?: string;
    [key: string]: any;
  }
): FunctionTokenValue
```

Each entry in `modifications` corresponds to a channel in the color space (e.g., for `oklch`: [lightness, chroma, hue]):

- `null` — preserve the original channel value
- `number` — set the channel to an absolute value
- `string` with operator — apply a relative operation:
  - `"+0.1"` — add to the channel value
  - `"-30"` — subtract from the channel value
  - `"*0.5"` — multiply the channel value
  - `"/2"` — divide the channel value

```typescript
// Rotate hue by 180° in oklch, keep lightness and chroma
ui.set('complementary', relativeTo(
  ref('brand.primary'),
  'oklch',
  [null, null, "+180"],
  ui
));

// Desaturate by halving chroma in oklch
ui.set('muted', relativeTo(
  ref('brand.primary'),
  'oklch',
  [null, "*0.5", null],
  ui
));

// Set specific lightness while preserving hue and chroma
ui.set('dark-variant', relativeTo(
  ref('brand.primary'),
  'oklch',
  [0.3, null, null],
  ui
));
```

- CSS renderer outputs: `color(from ${color} ${colorSpace} ${channel-expressions})` using `calc()` for relative operations.
  - Example: `color(from var(--brand-primary) oklch l c calc(h + 180))`
- JSON/W3 renderers resolve to computed hex value.

#### Scope Analysis

##### `closestColor(targetColor, scope, options?)`

Finds the perceptually closest color in a scope to the given target. Uses Euclidean distance in RGB space.

```typescript
export function closestColor(
  targetColor: TokenValue | ReferenceValue,
  scope: Scope,
  options?: { description?: string; [key: string]: any }
): FunctionTokenValue
```

- Returns the hex value of the closest match.
- If the scope has no valid color tokens, returns `#00000000` (transparent black) as fallback.

##### `furthestFrom(scope, options?)`

Identifies the color in a scope with the greatest average perceptual distance to all other colors in the same scope. Useful for finding the most "unique" or contrasting color.

```typescript
export function furthestFrom(
  scope: Scope,
  options?: { description?: string; [key: string]: any }
): FunctionTokenValue
```

- Uses CIELAB Delta E (Euclidean distance in LAB space) for perceptual accuracy.
- Returns the hex value of the most distant color.

### Non-Color Functions

##### `spacingScale(baseValue, options?)`

Multiplies a dimension token's value by a multiplier, preserving its unit.

```typescript
export function spacingScale(
  baseValue: TokenValue | ReferenceValue,
  scope: Scope,
  options?: {
    multiplier?: number;  // Scale factor (default 1)
    description?: string;
    [key: string]: any;
  }
): FunctionTokenValue
```

- Expects a `dimension` type token. Throws `FunctionError` if the resolved value is not a dimension.
- Returns `${value * multiplier}${unit}` (e.g., `"32px"`, `"2rem"`).

##### `typographyScale(baseSize, options?)`

Scales a base font size using a modular scale ratio. Useful for generating a consistent type hierarchy from a single base size.

```typescript
export function typographyScale(
  baseSize: TokenValue | ReferenceValue,
  scope: Scope,
  options?: {
    ratio?: number;   // Scale ratio (default 1.25, i.e. Major Third). Common values: 1.067 Minor Second, 1.125 Major Second, 1.2 Minor Third, 1.25 Major Third, 1.333 Perfect Fourth, 1.5 Perfect Fifth, 1.618 Golden Ratio
    step?: number;    // Number of steps up (positive) or down (negative) from the base (default 0)
    description?: string;
    [key: string]: any;
  }
): FunctionTokenValue
```

- Computes `baseSize * (ratio ^ step)`, preserving the unit of the base token.
- Expects a `dimension` type token. Throws `FunctionError` otherwise.

```typescript
const brand = book.addScope('brand');
brand.set('font-base', rem(1));

const ui = book.addScope('ui');
ui.set('text-sm', typographyScale(ref('brand.font-base'), ui, { ratio: 1.25, step: -1 }));  // 0.8rem
ui.set('text-base', ref('brand.font-base'));                                                  // 1rem
ui.set('text-lg', typographyScale(ref('brand.font-base'), ui, { ratio: 1.25, step: 1 }));   // 1.25rem
ui.set('text-xl', typographyScale(ref('brand.font-base'), ui, { ratio: 1.25, step: 2 }));   // 1.5625rem
ui.set('text-2xl', typographyScale(ref('brand.font-base'), ui, { ratio: 1.25, step: 3 }));  // 1.953rem
```

##### `timing(duration, easing, options?)`

Creates a timing/animation token combining a duration value with an easing function name. Useful for defining consistent motion tokens across a design system.

```typescript
export function timing(
  duration: TokenValue | ReferenceValue,
  easing: string,
  scope: Scope,
  options?: {
    delay?: number;       // Optional delay in ms (default 0)
    description?: string;
    [key: string]: any;
  }
): FunctionTokenValue
```

- Expects `duration` to resolve to a dimension token (with a time unit like `ms` or `s`).
- Returns a string like `"200ms ease-in-out"` or `"200ms ease-in-out 100ms"` (with delay).
- CSS renderer can output the timing as a CSS transition shorthand fragment.

```typescript
brand.set('duration-fast', px(150));   // px used loosely; consider a ms() helper
brand.set('duration-normal', px(300));

ui.set('transition-hover', timing(ref('brand.duration-fast'), 'ease-out', ui, {
  description: 'Quick hover transition'
}));

ui.set('transition-expand', timing(ref('brand.duration-normal'), 'ease-in-out', ui, {
  delay: 50,
  description: 'Panel expand with slight delay'
}));
```

### Value Types with Options Support

- `hex(value, options?)` - Color values with description and metadata
- `ref(key, options?)` - References with description
- `px(value, options?)`, `rem(value, options?)` - Dimension values with description and metadata

## Benefits of Unified Token Format

### 1. **Consistent Options Pattern**

```typescript
// All values and functions follow the same pattern
const color = hex('#ff0000');
const spacing = px(16);
const reference = ref('brand.primary');
const mixedColor = colorMix(
  ref('color1'),
  ref('color2'),
  { ratio: 0.25, colorSpace: 'oklch' }
);

// Universal val() wrapper ensures consistency
const customValue = val(someComplexValue, {
  description: 'Custom description',
  customMetadata: 'additional data'
});
```

### 2. **Rich Metadata with Pre-processed Values**

```typescript
// Values carry both processed data and metadata
const colorValue = hex('#ff0000');
console.log(colorValue.processors?.[0]?.instance); // Pre-parsed Culori object
console.log(colorValue.metadata?.validated); // true

// Functions carry their options and implementation together
const mixFunction = colorMix(color1, color2, {
  ratio: 0.3,
  colorSpace: 'lab'
});
console.log(mixFunction.options?.ratio); // 0.3
console.log(mixFunction.options?.colorSpace); // 'lab'
```

### 3. **Type Safety with Function Signatures**

```typescript
// Functions declare what types they accept and their options
const mixFunction = colorMix(color1, color2, { ratio: 0.5, colorSpace: 'oklch' });
console.log(mixFunction.metadata?.acceptedTypes); 
// [['color', 'reference'], ['color', 'reference']]

// Scope-based functions include filtering metadata
const closestFunction = closestColor(targetColor, scope);
console.log(closestFunction.metadata?.requiresTypeFiltering); // true
console.log(closestFunction.metadata?.requiredTypes); // ['color']

// Runtime validation includes options and type requirements
function validateFunction(fn: FunctionTokenValue): void {
  fn.args.forEach((arg, index) => {
    const expectedTypes = fn.metadata?.acceptedTypes?.[index];
    if (expectedTypes && typeof arg === 'object' && 'type' in arg) {
      if (!expectedTypes.includes(arg.type)) {
        throw new Error(`Argument ${index} expects one of [${expectedTypes.join(', ')}], got ${arg.type}`);
      }
    }
  });
  
  // Validate options
  if (fn.rawValue === 'colorMix' && fn.options) {
    const ratio = fn.options.ratio;
    if (ratio !== undefined && (ratio < 0 || ratio > 1)) {
      throw new Error('colorMix ratio must be between 0 and 1');
    }
  }
  
  // Check if scope-based function will find required types
  if (fn.metadata?.requiresTypeFiltering) {
    const scopeArg = fn.args.find(arg => typeof arg === 'object' && 'getAllKeys' in arg) as Scope;
    if (scopeArg) {
      const requiredTypes = fn.metadata.requiredTypes || [];
      const hasRequiredTypes = scopeArg.getAllKeys().some(key => {
        const token = scopeArg.get(key);
        return token && requiredTypes.includes(token.type);
      });
      
      if (!hasRequiredTypes) {
        throw new Error(`Function ${fn.rawValue} requires tokens of type [${requiredTypes.join(', ')}] in scope`);
      }
    }
  }
}
```

### 5. **Optimized Processing Pipeline**

```typescript
// Pre-parsed instances avoid re-parsing while maintaining context
const colorValue = hex('#ff0000');
// Culori instance created once and stored in processors

function fastColorMix(color1: TokenValue, color2: TokenValue, options: any): string {
  const processor1 = color1.processors?.find(p => p.name === 'culori');
  const processor2 = color2.processors?.find(p => p.name === 'culori');
  
  // Use pre-parsed instances - no re-parsing needed!
  const interpolator = interpolate([processor1?.instance, processor2?.instance]);
  const ratio = options?.ratio || 0.5;
  return formatHex(interpolator(ratio));
}
```

## Error Handling

```typescript
// Enhanced error types with context
export class TokenError extends Error {
  constructor(
    message: string,
    public readonly tokenKey?: string,
    public readonly context?: Record<string, any>
  ) {
    super(message);
    this.name = 'TokenError';
  }
}

export class ScopeError extends Error {
  constructor(
    message: string,
    public readonly scopeName?: string
  ) {
    super(message);
    this.name = 'ScopeError';
  }
}

export class CircularDependencyError extends Error {
  constructor(public readonly path: string[]) {
    super(`Circular dependency detected: ${path.join(' → ')}`);
    this.name = 'CircularDependencyError';
  }
}

export class FunctionError extends Error {
  constructor(
    message: string,
    public readonly functionName?: string,
    public readonly options?: Record<string, any>
  ) {
    super(message);
    this.name = 'FunctionError';
  }
}

// Error handling in practice
try {
  const invalidMix = colorMix(
    hex('#invalid-color'),
    ref('brand.primary'),
    { ratio: 1.5 } // Invalid ratio
  );
} catch (error) {
  if (error instanceof FunctionError) {
    console.error('Function error:', {
      message: error.message,
      function: error.functionName,
      options: error.options
    });
  }
}
```

## Event System

The event system enables reactive updates and observability throughout the design system. Core events include:

- `change`: Fired when any token or scope changes. Payload: `{ detail: { changedKeys: string[], scopes: string[] } }`
- `scopeAdded`: Fired when a new scope is added. Payload: `{ scopeName: string }`
- `scopeRemoved`: Fired when a scope is deleted. Payload: `{ scopeName: string }`
- `tokenChanged`: Fired when a specific token value changes. Payload: `{ key: string, newValue: any, oldValue: any }`
- `batch-complete`: Fired after a successful `flush()` in batch mode. Payload: `{ detail: { processedKeys: string[], totalProcessed: number } }`
- `batch-failed`: Fired when `flush()` encounters errors. Payload: `{ detail: { errors: Error[], affectedKeys: string[] } }`

You can subscribe to these events using `book.on(event, callback)`.

## Error Handling Strategy

- All errors use custom error classes (`TokenError`, `ScopeError`, `CircularDependencyError`, `FunctionError`).
- In `auto` mode, errors are thrown immediately and must be handled by the caller.
- In `batch` mode, errors are collected during the batch and reported after `flush()`. The `flush()` method returns or throws a summary of all errors encountered.
- All errors include context (scope, token, operation) to aid debugging.
- Error types are extensible for custom token types or renderers.

## Renderer Extensibility

The renderer system is designed for extensibility:

- To add a new renderer, extend the base `ColorRenderer` or implement a new class with a `render()` method.
- Register new output formats by adding a new `RenderFormat` and implementing the corresponding renderer.
- Function renderers can be registered for custom token types or output formats using `registerFunctionRenderer(functionName, renderer)`.
- Example: To support a new format (e.g., Figma tokens), create `FigmaRenderer` extending `ColorRenderer` and implement the format-specific logic.

## Testing and Validation

- Token definitions should be covered by unit tests to ensure correct resolution, reference handling, and function output.
- Provide validation utilities to check for unresolved references, circular dependencies, and required metadata.
- Linting tools can enforce best practices (e.g., all tokens have descriptions, no duplicate keys, all references are valid).
- Example validation function:

```typescript
function validateDesignBook(book: DesignBook): string[] {
  const errors: string[] = [];
  for (const scope of book.getAllScopes()) {
    for (const key of scope.config.getAllKeys()) {
      const token = scope.config.get(key);
      if (!token) errors.push(`Missing token: ${key}`);
      if (token?.type === 'reference' && !book.has(token.key)) {
        errors.push(`Unresolved reference: ${key} → ${token.key}`);
      }
      if (!token?.description) errors.push(`Missing description for: ${key}`);
    }
  }
  if (book.getDependencyGraph().hasCycles()) {
    errors.push('Circular dependencies detected');
  }
  return errors;
}
```

## Dependency Graph

The `DependencyGraph` class extends a generic `Graph` class, inheriting traversal, cycle detection, and pathfinding algorithms. This separation allows for easier extension and testing. The `DependencyGraph` adds domain-specific logic for token relationships and can be further extended for custom dependency types or analysis tools.

- `Graph` class: Provides generic graph operations (addNode, addEdge, removeNode, traversal, etc.).
- `DependencyGraph` class: Extends `Graph` and adds token-specific methods (e.g., `getPrerequisitesFor`, `getDependentsOf`, cycle detection, evaluation order).
- This design allows for future extension (e.g., supporting dependency weights, grouping, or visualization).