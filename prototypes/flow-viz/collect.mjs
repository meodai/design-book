// Shared extraction: a book → { scopes, tokens, edges } for the layout prototype.
// Edge kinds: 'ref' / 'fn' (what a token resolves through), 'pick' (the member a
// selector picked), 'overrides' (an own token over a key its parent scope has), 'ctx' (a selector's other
// inputs, with a role: shown only on hover). Tokens record the pools they pick from.
export function collect(book, hexOf) {
  const scopes = book.getAllScopes().map(s => ({ name: s.name, extends: s.extendsScope ?? null }));
  const tokens = [], edges = [];
  const tokenKey = (d) => d.split('.').slice(0, 2).join('.');
  const refKey = (r) => (r && typeof r === 'object' ? r.key : r);
  for (const s of book.getAllScopes()) for (const k of book.getAllKeysForScope(s.name)) {
    const key = k.startsWith(s.name + '.') ? k : `${s.name}.${k}`;
    const info = book.inspect(key); if (!info) continue;
    const hex = info.value != null ? hexOf(info.value) : null;
    const inh = book.isInherited(key) && !(book.isRebound?.(key));
    const tok = book.getTokenByKey(key);
    const pools = inh ? [] : [...new Set([
      ...(tok?.metadata?.iteratedScopes ?? []),
      ...(tok?.args ?? []).filter(a => a?.type === 'reference' && !a.key.includes('.')).map(a => a.key),
    ].filter(Boolean))];
    const name = key.slice(s.name.length + 1);
    tokens.push({ key, scope: s.name, name, value: info.value ?? null, hex, fn: info.function ?? (info.tokenType === 'reference' ? 'ref' : null), inherited: inh, source: inh ? book.getSourceKey(key) : null, pools });
    // an inherited token draws nothing (it is the parent's); an own token over a parent's key is a difference
    if (inh) continue;
    // (a re-bound copy, `ref('.x')` read in this scope, is the parent's rule: it keeps its own reads but is no override)
    if (s.extendsScope && s.hasOwn(name) && book.has(`${s.extendsScope}.${name}`)) edges.push({ from: book.getSourceKey(`${s.extendsScope}.${name}`) ?? `${s.extendsScope}.${name}`, to: key, kind: 'overrides' });
    const isSel = pools.length > 0;
    const o = tok?.options ?? {}, args = tok?.args ?? [];
    const roleOf = (d) => {
      if (refKey(o.from) === d) return 'steps from';
      if (refKey(o.toward) === d) return 'toward';
      if ((o.not ?? []).some(n => refKey(n) === d)) return 'not';
      if (o.readableContrast != null && refKey(args[args.length - 1]) === d) return 'readable on';
      if (o.upTo && args.some((a, i) => i > 1 && refKey(a) === d)) return 'up to';
      if (refKey(args[0]) === d) return 'compares to';
      return 'input';
    };
    for (const d of info.dependencies) {
      const from = tokenKey(d);
      if (info.tokenType === 'reference') edges.push({ from, to: key, kind: 'ref' });
      else if (isSel) edges.push({ from, to: key, kind: 'ctx', role: roleOf(from) });
      else edges.push({ from, to: key, kind: 'fn' });
    }
    for (const pool of pools) for (const mk of book.getAllKeysForScope(pool)) {
      const mkey = mk.startsWith(pool + '.') ? mk : `${pool}.${mk}`;
      if (mkey === key) continue;
      try { const v = book.resolve(mkey); if (v === info.value || (hex && hexOf(v) === hex)) { edges.push({ from: mkey, to: key, kind: 'pick' }); break; } } catch {}
    }
  }
  return { scopes, tokens, edges };
}
