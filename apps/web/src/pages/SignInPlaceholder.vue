<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { AuthRequestError } from '../auth-client.js';
import { useSessionStore } from '../stores/session.js';
const session = useSessionStore();
const router = useRouter();
const username = ref('');
const password = ref('');
const busy = ref(false);
const failed = ref(false);
const retryAfter = ref(0);
async function signIn() {
  if (busy.value) return;
  busy.value = true;
  failed.value = false;
  retryAfter.value = 0;
  try {
    await session.login(username.value, password.value);
    await router.push('/_user');
  } catch (error) {
    failed.value = true;
    if (error instanceof AuthRequestError) retryAfter.value = error.retryAfterSeconds ?? 0;
  } finally {
    password.value = '';
    busy.value = false;
  }
}
</script>
<template>
  <section class="mx-auto max-w-prose px-6 py-16" aria-labelledby="sign-in-title">
    <h1 id="sign-in-title" class="text-2xl font-semibold mb-4">{{ $t('signIn.title') }}</h1>
    <p class="mb-4">{{ $t('auth.recoveryWarning') }}</p>
    <form @submit.prevent="signIn">
      <label for="username">{{ $t('auth.username') }}</label>
      <input
        id="username"
        v-model="username"
        name="username"
        autocomplete="username"
        required
        maxlength="64"
        class="block border p-2 mb-4 w-full"
      />
      <label for="password">{{ $t('auth.password') }}</label>
      <input
        id="password"
        v-model="password"
        name="password"
        type="password"
        autocomplete="current-password"
        required
        maxlength="128"
        class="block border p-2 mb-4 w-full"
      />
      <p v-if="failed" role="alert">
        {{ retryAfter ? $t('auth.retryAfter', { seconds: retryAfter }) : $t('auth.rejected') }}
      </p>
      <v-btn type="submit" :disabled="busy">{{ $t('signIn.title') }}</v-btn>
    </form>
    <RouterLink to="/_auth/register" class="block mt-4">{{ $t('auth.register') }}</RouterLink>
  </section>
</template>
