export class TokenError extends Error {
  public readonly tokenKey?: string;
  public readonly context?: Record<string, any>;

  constructor(message: string, tokenKey?: string, context?: Record<string, any>) {
    super(message);
    this.name = 'TokenError';
    this.tokenKey = tokenKey;
    this.context = context;
  }
}

export class ScopeError extends Error {
  public readonly scopeName?: string;

  constructor(message: string, scopeName?: string) {
    super(message);
    this.name = 'ScopeError';
    this.scopeName = scopeName;
  }
}

export class CircularDependencyError extends Error {
  public readonly path: string[];

  constructor(path: string[]) {
    super(`Circular dependency detected: ${path.join(' → ')}`);
    this.name = 'CircularDependencyError';
    this.path = path;
  }
}

export class FunctionError extends Error {
  public readonly functionName?: string;
  public readonly options?: Record<string, any>;

  constructor(message: string, functionName?: string, options?: Record<string, any>) {
    super(message);
    this.name = 'FunctionError';
    this.functionName = functionName;
    this.options = options;
  }
}
