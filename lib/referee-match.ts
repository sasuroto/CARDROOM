const parts = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z\s]/g, '').trim().split(/\s+/).filter(Boolean);

// Callers provide rows from one tournament. Shortened names must identify one row.
export function findRefereeRow(rows: any[], name: string) {
  const query = parts(name || '');
  if (query.length < 2) return undefined;
  const normalized = rows.map(row => ({row, tokens: parts(row.name || '')}));
  const exact = normalized.filter(({tokens}) => tokens.join(' ') === query.join(' '));
  if (exact.length) return exact.length === 1 ? exact[0].row : undefined;

  const candidates = normalized.filter(({tokens}) => {
    if (tokens.length < 2 || tokens[0][0] !== query[0][0]) return false;
    // Official appointments can omit a second surname (Orellana / Orellana Cid).
    const sharedLength = Math.min(tokens.length, query.length);
    const sharedName = tokens.slice(1, sharedLength).every((token, i) => token === query[i + 1]);
    return sharedName || tokens.at(-1) === query.at(-1);
  });
  if (candidates.length !== 1) return undefined;
  const candidate = candidates[0];
  // A matching first letter alone must not merge two fully spelled given names.
  const first = candidate.tokens[0];
  return first === query[0] || first.length === 1 || query[0].length === 1
    ? candidate.row : undefined;
}
