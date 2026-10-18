<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { authClient } from '../auth-client.js';
const emit = defineEmits<{ policy: [enabled: boolean] }>();
const unavailable = ref(true);
onMounted(async () => {
  try {
    const policy = await authClient.recoveryPolicy();
    unavailable.value = !policy.recoveryEnabled;
    emit('policy', policy.captchaEnabled === true);
  } catch {
    // An unavailable policy must not imply that recovery will be possible.
    unavailable.value = true;
  }
});
</script>
<template>
  <aside role="note" class="my-4">
    <p>{{ $t('auth.recoveryWarning') }}</p>
    <p v-if="unavailable" role="status">{{ $t('recovery.disabled') }}</p>
  </aside>
</template>
