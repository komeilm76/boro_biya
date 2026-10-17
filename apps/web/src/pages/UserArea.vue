<script setup lang="ts">
import LocalizedTime from '../components/LocalizedTime.vue';
import SecurityAnswersForm from '../components/SecurityAnswersForm.vue';
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { authClient } from '../auth-client.js';
import { useSessionStore } from '../stores/session.js';
const session = useSessionStore();
const router = useRouter();
const sessions = ref<Awaited<ReturnType<typeof authClient.sessions>>>([]);
const failed = ref(false);
const busy = ref(false);
const currentPassword = ref('');
const password = ref('');
const repeatPassword = ref('');
let generation = 0,
  read = 0;
function clearPrivateState() {
  generation++;
  read++;
  sessions.value = [];
  currentPassword.value = '';
  password.value = '';
  repeatPassword.value = '';
  failed.value = false;
  busy.value = false;
}
watch([() => session.accessToken, () => session.authVersion, () => session.userId], clearPrivateState, {
  flush: 'sync',
});
onUnmounted(clearPrivateState);
async function changePassword() {
  if (busy.value) return;
  const ticket = generation;
  busy.value = true;
  failed.value = false;
  try {
    await authClient.changePassword(
      { currentPassword: currentPassword.value, password: password.value, repeatPassword: repeatPassword.value },
      session.accessToken ?? '',
    );
    if (ticket !== generation) return;
    session.clearSession();
    await router.push('/_auth/login');
  } catch {
    if (ticket === generation) failed.value = true;
  } finally {
    if (ticket === generation) {
      currentPassword.value = '';
      password.value = '';
      repeatPassword.value = '';
      busy.value = false;
    }
  }
}

async function load() {
  const ticket = generation,
    request = ++read;
  failed.value = false;
  try {
    const result = await authClient.sessions(session.accessToken ?? '');
    if (ticket === generation && request === read) sessions.value = result;
  } catch {
    if (ticket === generation && request === read) failed.value = true;
  }
}
async function revoke(id?: string) {
  if (busy.value) return;
  const ticket = generation;
  busy.value = true;
  failed.value = false;
  try {
    await authClient.revokeSessions(id, session.accessToken ?? '');
    if (ticket === generation) await load();
  } catch {
    if (ticket === generation) failed.value = true;
  } finally {
    if (ticket === generation) busy.value = false;
  }
}
async function logout() {
  // The store clears identity synchronously, then serializes the cookie-changing request.
  const pending = session.logout();
  const ticket = generation;
  try {
    await pending;
    if (ticket === generation && !session.isAuthenticated) await router.push('/_auth/login');
  } catch {
    if (ticket === generation) failed.value = true;
  }
}
onMounted(load);
</script>
<template>
  <section class="mx-auto max-w-prose px-6 py-16" aria-labelledby="user-area-title">
    <h1 id="user-area-title" class="text-2xl font-semibold mb-4">{{ $t('userArea.title') }}</h1>
    <aside v-for="(notice, index) in session.securityNotices" :key="index" role="status" class="my-4">
      {{ $t(`securityNotices.${notice.event}`) }} <LocalizedTime :value="notice.createdAt" />
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
    <RouterLink v-if="session.isAdmin" to="/_admin">{{ $t('adminArea.title') }}</RouterLink>
    <SecurityAnswersForm />
    <p v-if="failed" role="alert">{{ $t('auth.loadFailed') }}</p>
    <v-btn data-action="load" @click="load">{{ $t('auth.refreshSessions') }}</v-btn>
    <ul>
      <li v-for="entry in sessions" :key="entry.familyId" class="my-4">
        <LocalizedTime :value="entry.lastSeenAt" />
        <v-btn data-action="revoke-session" :disabled="busy" @click="revoke(entry.familyId)">{{
          $t('auth.revoke')
        }}</v-btn>
      </li>
    </ul>
    <v-btn data-action="revoke-others" :disabled="busy" @click="revoke()">{{ $t('auth.revokeOthers') }}</v-btn>
    <v-btn data-action="logout" @click="logout">{{ $t('auth.logout') }}</v-btn>
    <RouterLink to="/_public/privacy" class="block mt-4">{{ $t('auth.privacy') }}</RouterLink>
  </section>
</template>
