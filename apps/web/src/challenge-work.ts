/** Public proof-of-work protocol: SHA-256 of nonce + ':' + decimal counter. */
export function workMatches(digest: Uint8Array, bits: number): boolean {
  if (!Number.isInteger(bits) || bits < 12 || bits > 20 || digest.length !== 32) return false;
  for (let i = 0; i < bits; i++) if ((digest[Math.floor(i / 8)]! & (1 << (7 - (i % 8)))) !== 0) return false;
  return true;
}
export async function solveChallenge(
  token: string,
  bits: number,
  options: { signal: AbortSignal; now?: () => number; digest?: (input: Uint8Array) => Promise<ArrayBuffer> },
) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token) || !Number.isInteger(bits) || bits < 12 || bits > 20)
    throw new Error('invalid challenge');
  const now = options.now ?? (() => performance.now()),
    deadline = now() + 45000,
    encoder = new TextEncoder();
  const digest =
    options.digest ?? ((input: Uint8Array) => crypto.subtle.digest('SHA-256', input as Uint8Array<ArrayBuffer>));
  for (let counter = 0; counter <= 0xffffffff; counter++) {
    if (options.signal.aborted || now() >= deadline) throw new Error('challenge stopped');
    const hashed = new Uint8Array(await digest(encoder.encode(`${token}:${counter}`)));
    if (options.signal.aborted || now() >= deadline) throw new Error('challenge stopped');
    if (workMatches(hashed, bits)) return counter;
  }
  throw new Error('challenge exhausted');
}
