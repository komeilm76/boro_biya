<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue';
import type { ChallengePurpose } from '@boro-biya/validation';
import { authClient } from '../auth-client.js';
const props = defineProps<{ enabled: boolean; purpose: ChallengePurpose; disabled?: boolean }>();
const emit = defineEmits<{ working: [value: boolean] }>();
const proof = defineModel<string>({ required: true });
const busy = ref(false),
  failed = ref(false),
  checked = ref(false);
let expires: ReturnType<typeof setTimeout> | undefined;
let workDeadline: ReturnType<typeof setTimeout> | undefined;
let worker: Worker | undefined,
  version = 0;
let rejectWork: ((error: Error) => void) | undefined;
function stop() {
  clearTimeout(expires);
  clearTimeout(workDeadline);
  version++;
  worker?.terminate();
  worker = undefined;
  rejectWork?.(new Error('challenge stopped'));
  rejectWork = undefined;
  busy.value = false;
  checked.value = false;
  proof.value = '';
}
watch(() => [props.enabled, props.purpose], stop);
watch(busy, (value) => emit('working', value), { flush: 'sync' });
watch(
  () => props.disabled,
  (value) => {
    if (value) checked.value = false;
  },
);
watch(proof, (value, previous) => {
  if (!value && previous) {
    checked.value = false;
  }
});
onUnmounted(stop);
async function solve() {
  if (busy.value || props.disabled || !props.enabled) return;
  stop();
  const ticket = version;
  const purpose = props.purpose;
  busy.value = true;
  failed.value = false;
  try {
    const { csrfToken } = await authClient.csrf();
    if (ticket !== version) return;
    const challenge = await authClient.challenge(purpose, csrfToken);
    if (ticket !== version) return;
    if (!challenge.required) {
      checked.value = true;
      return;
    }
    const counter = await new Promise<number>((resolve, reject) => {
      rejectWork = reject;
      // The worker may stall inside an unresolved digest; its own loop cannot bound that wait.
      workDeadline = setTimeout(() => reject(new Error('challenge stopped')), 45000);
      worker = new Worker(new URL('../challenge-worker.ts', import.meta.url), { type: 'module' });
      worker.onerror = () => reject(new Error('challenge unavailable'));
      worker.onmessage = (event: MessageEvent<unknown>) => {
        const data = event.data;
        if (
          !data ||
          typeof data !== 'object' ||
          !('counter' in data) ||
          typeof data.counter !== 'number' ||
          !Number.isSafeInteger(data.counter) ||
          data.counter < 0 ||
          data.counter > 0xffffffff
        )
          reject(new Error('invalid work'));
        else resolve(data.counter);
      };
      worker.postMessage({ token: challenge.token, bits: challenge.bits });
    });
    clearTimeout(workDeadline);
    if (ticket !== version) return;
    const grant = await authClient.verifyChallenge(purpose, challenge.token, counter, csrfToken);
    if (ticket !== version) return;
    const remaining = Math.min(60000, Date.parse(grant.expiresAt) - Date.now());
    if (!Number.isFinite(remaining) || remaining <= 0) throw new Error('challenge expired');
    expires = setTimeout(() => {
      if (ticket === version) {
        proof.value = '';
        checked.value = false;
      }
    }, remaining);
    proof.value = grant.grant;
    checked.value = true;
  } catch {
    if (ticket === version) failed.value = true;
  } finally {
    if (ticket === version) {
      clearTimeout(workDeadline);
      worker?.terminate();
      worker = undefined;
      rejectWork = undefined;
      busy.value = false;
    }
  }
}
</script>
<template>
  <section v-if="enabled" class="my-4" :aria-busy="busy">
    <h2>{{ $t('challenge.title') }}</h2>
    <p>{{ $t('challenge.notice') }}</p>
    <p role="status" aria-live="polite">
      {{ $t(busy ? 'challenge.working' : checked ? 'challenge.ready' : 'challenge.idle') }}
    </p>
    <p v-if="failed" role="alert">{{ $t('challenge.failed') }}</p>
    <button type="button" :disabled="busy || disabled" @click="solve">{{ $t('challenge.start') }}</button>
    <button v-if="busy" type="button" :disabled="disabled" @click="stop">{{ $t('challenge.cancel') }}</button>
  </section>
</template>
