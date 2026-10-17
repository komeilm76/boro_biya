// Test orchestration only: success journeys are not a native-hashing load test.
// Invoke each explicit action exactly once, without retries or capacity/policy changes.
export function createCredentialSequence() {
  let pending = Promise.resolve();
  return (operation) => {
    const result = pending.then(operation);
    pending = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
}
