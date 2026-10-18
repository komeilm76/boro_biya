/** Pure catalogue acceptance check, shared by tests. Interpolation names are part of the
 * translation contract; matching keys alone can leave a translated action unusable. */
export function catalogueEntries(value: unknown, prefix = ''): Record<string, string> {
  if (typeof value === 'string') {
    if (!value.trim()) throw new Error(`empty message: ${prefix}`);
    return { [prefix]: value };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`invalid catalogue: ${prefix}`);
  const result: Record<string, string> = {};
  for (const [key, nested] of Object.entries(value))
    Object.assign(result, catalogueEntries(nested, prefix ? `${prefix}.${key}` : key));
  return result;
}
export function assertCatalogueParity(reference: unknown, translated: unknown) {
  const source = catalogueEntries(reference),
    target = catalogueEntries(translated);
  if (Object.keys(source).sort().join('\n') !== Object.keys(target).sort().join('\n'))
    throw new Error('catalogue key mismatch');
  for (const [key, text] of Object.entries(source)) {
    const names = (message: string) =>
      [...new Set([...message.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((match) => match[1]))].sort().join(',');
    if (names(text) !== names(target[key]!)) throw new Error(`catalogue parameter mismatch: ${key}`);
  }
}
