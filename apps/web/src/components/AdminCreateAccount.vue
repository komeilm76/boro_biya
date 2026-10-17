<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { authClient } from '../auth-client.js';
import { useSessionStore } from '../stores/session.js';
const session = useSessionStore();
const { locale } = useI18n();
const username = ref('');
const currentPassword = ref('');
const temporaryPassword = ref('');
const created = ref<Awaited<ReturnType<typeof authClient.createAccount>> | null>(null);
const busy = ref(false);
const failed = ref(false);
let generation = 0;
function clear() {
  generation++;
  username.value = '';
  currentPassword.value = '';
  temporaryPassword.value = '';
  created.value = null;
  busy.value = false;
  failed.value = false;
}
watch([() => session.accessToken, () => session.authVersion, () => session.permissions?.join('|')], clear, {
  flush: 'sync',
});
onUnmounted(clear);
function date(value: string) {
  return new Intl.DateTimeFormat(locale.value === 'fa' ? 'fa-IR-u-ca-persian' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
async function submit() {
  if (busy.value) return;
  const ticket = generation;
  const token = session.accessToken ?? '';
  busy.value = true;
  failed.value = false;
  created.value = null;
  try {
    const result = await authClient.createAccount(
      username.value,
      currentPassword.value,
      temporaryPassword.value || undefined,
      token,
    );
    if (ticket === generation) created.value = result;
  } catch {
    if (ticket === generation) failed.value = true;
  } finally {
    if (ticket === generation) {
      currentPassword.value = '';
      temporaryPassword.value = '';
      busy.value = false;
    }
  }
}
</script>
<template>
  <section>
    <h2>{{ $t('adminCreate.title') }}</h2>
    <p>{{ $t('adminCreate.notice') }}</p>
    <form :aria-busy="busy" @submit.prevent="submit">
      <fieldset :disabled="busy" class="grid gap-3">
        <label for="created-username">{{ $t('auth.username') }}</label>
        <input id="created-username" v-model="username" required autocomplete="off" maxlength="64" />
        <label for="admin-current-password">{{ $t('auth.currentPassword') }}</label>
        <input
          id="admin-current-password"
          v-model="currentPassword"
          type="password"
          required
          autocomplete="current-password"
          maxlength="128"
        />
        <label for="created-temporary-password">{{ $t('adminCreate.temporary') }}</label>
        <input
          id="created-temporary-password"
          v-model="temporaryPassword"
          type="password"
          autocomplete="new-password"
          maxlength="128"
        />
        <button type="submit">{{ $t('adminCreate.submit') }}</button>
      </fieldset>
    </form>
    <p v-if="failed" role="alert">{{ $t('auth.rejected') }}</p>
    <aside v-if="created" role="status" class="grid gap-3">
      <p>{{ $t('adminCreate.created') }}</p>
      <p>{{ created.username }}</p>
      <template v-if="created.setupCredential">
        <label for="created-setup-credential">{{ $t('adminCreate.credential') }}</label>
        <output id="created-setup-credential">{{ created.setupCredential }}</output>
      </template>
      <p>
        {{ $t('adminCreate.expires') }} <time :datetime="created.expiresAt">{{ date(created.expiresAt) }}</time>
      </p>
      <button type="button" @click="created = null">{{ $t('adminCreate.forget') }}</button>
    </aside>
  </section>
</template>
