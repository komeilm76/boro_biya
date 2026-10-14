/** Fails a documented application-runtime command when it is not running on Node 24 LTS. */
export function requireNode24(command) {
  if (Number(process.versions.node.split('.')[0]) === 24) return true;
  process.stderr.write(`[runtime] ${command} requires Node 24 LTS; found ${process.version}.\n`);
  return false;
}
