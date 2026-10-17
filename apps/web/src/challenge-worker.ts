import { solveChallenge } from './challenge-work.js';
// This module runs only in the dedicated Vite worker. Termination cancels all work.
self.addEventListener('message', (event: MessageEvent<unknown>) => {
  const value = event.data;
  if (
    !value ||
    typeof value !== 'object' ||
    !('token' in value) ||
    !('bits' in value) ||
    typeof value.token !== 'string' ||
    typeof value.bits !== 'number'
  ) {
    self.postMessage({ failed: true });
    return;
  }
  void solveChallenge(value.token, value.bits, { signal: new AbortController().signal }).then(
    (counter) => self.postMessage({ counter }),
    () => self.postMessage({ failed: true }),
  );
});
