<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { authClient } from '../auth-client.js';
const unavailable = ref(true);
onMounted(async () => {
  try {
    unavailable.value = !(await authClient.recoveryPolicy()).recoveryEnabled;
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
