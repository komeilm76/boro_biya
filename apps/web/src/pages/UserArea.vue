<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { authClient, authRequest, emptyResponse, acceptedResponse } from '../auth-client.js';
import { useSessionStore } from '../stores/session.js';
const session = useSessionStore();
const router = useRouter();
const { locale } = useI18n();
const sessions = ref<Awaited<ReturnType<typeof authClient.sessions>>>([]);
const failed = ref(false);
const busy = ref(false);
const currentPassword = ref('');
const password = ref('');
const repeatPassword = ref('');
async function changePassword() {
  if (busy.value) return;
  busy.value = true;
  try {
    await authRequest('/api/v1/auth/password/change', acceptedResponse, {
      method: 'POST',
      token: session.accessToken ?? '',
      body: { currentPassword: currentPassword.value, password: password.value, repeatPassword: repeatPassword.value },
    });
    session.clearSession();
    await router.push('/_auth/login');
  } catch {
    failed.value = true;
  } finally {
    currentPassword.value = '';
    password.value = '';
    repeatPassword.value = '';
    busy.value = false;
  }
}
function date(value: string) {
  return new Intl.DateTimeFormat(locale.value === 'fa' ? 'fa-IR-u-ca-persian' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
async function load() {
  failed.value = false;
  try {
    sessions.value = await authClient.sessions(session.accessToken ?? '');
  } catch {
    failed.value = true;
  }
}
async function revoke(id?: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    await authRequest(`/api/v1/auth/sessions${id === undefined ? '' : `/${encodeURIComponent(id)}`}`, emptyResponse, {
      method: 'DELETE',
      token: session.accessToken ?? '',
    });
    await load();
  } catch {
    failed.value = true;
  } finally {
    busy.value = false;
  }
}
async function logout() {
  try {
    await session.logout();
    await router.push('/_auth/login');
  } catch {
    failed.value = true;
  }
}
onMounted(load);
</script>
<template>
  <section class="mx-auto max-w-prose px-6 py-16" aria-labelledby="user-area-title">
    <h1 id="user-area-title" class="text-2xl font-semibold mb-4">{{ $t('userArea.title') }}</h1>
    <aside v-for="(notice, index) in session.securityNotices" :key="index" role="status" class="my-4">
      {{ $t(`securityNotices.${notice.event}`) }} <time :datetime="notice.createdAt">{{ date(notice.createdAt) }}</time>
    </aside>
    <h2>{{ $t('auth.sessions') }}</h2>
    <form class="my-6" @submit.prevent="changePassword">
      <h3>{{ $t('auth.changePassword') }}</h3>
      <p>{{ $t('auth.passwordChangeNotice') }}</p>
      <label for="current-password">{{ $t('auth.currentPassword') }}</label
      ><input
        id="current-password"
        v-model="currentPassword"
        type="password"
        required
        autocomplete="current-password"
        class="block border p-2 w-full"
      />
      <label for="new-password">{{ $t('auth.password') }}</label
      ><input
        id="new-password"
        v-model="password"
        type="password"
        required
        minlength="12"
        maxlength="128"
        autocomplete="new-password"
        class="block border p-2 w-full"
      />
      <label for="new-password-repeat">{{ $t('auth.repeatPassword') }}</label
      ><input
        id="new-password-repeat"
        v-model="repeatPassword"
        type="password"
        required
        maxlength="128"
        autocomplete="new-password"
        class="block border p-2 w-full"
      />
      <v-btn type="submit" :disabled="busy">{{ $t('auth.changePassword') }}</v-btn>
    </form>
    <p v-if="failed" role="alert">{{ $t('auth.loadFailed') }}</p>
    <v-btn data-action="load" @click="load">{{ $t('auth.refreshSessions') }}</v-btn>
    <ul>
      <li v-for="entry in sessions" :key="entry.familyId" class="my-4">
        <time :datetime="entry.lastSeenAt">{{ date(entry.lastSeenAt) }}</time>
        <v-btn :disabled="busy" @click="revoke(entry.familyId)">{{ $t('auth.revoke') }}</v-btn>
      </li>
    </ul>
    <v-btn data-action="revoke-others" :disabled="busy" @click="revoke()">{{ $t('auth.revokeOthers') }}</v-btn>
    <v-btn data-action="logout" @click="logout">{{ $t('auth.logout') }}</v-btn>
    <RouterLink to="/_public/privacy" class="block mt-4">{{ $t('auth.privacy') }}</RouterLink>
  </section>
</template>
