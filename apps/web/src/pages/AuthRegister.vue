<script setup lang="ts">
import AuthChallenge from '../components/AuthChallenge.vue';
import RecoveryWarning from '../components/RecoveryWarning.vue';
import { useI18n } from 'vue-i18n';
import { onUnmounted, ref, watch } from 'vue';
import { useSessionStore } from '../stores/session.js';
import { authClient } from '../auth-client.js';
const session = useSessionStore();
const { locale } = useI18n();
const username = ref('');
const password = ref('');
const repeatPassword = ref('');
const questions = ref([1, 2, 3, 4, 5]);
const answers = ref(['', '', '', '', '']);
const captchaEnabled = ref(false);
const challenge = ref('');
const challengeBusy = ref(false);
const busy = ref(false);
const failed = ref(false);
const accepted = ref(false);
const keys = [
  'firstBook',
  'childhoodGame',
  'favoriteTeacher',
  'memorablePlace',
  'favoriteCharacter',
  'firstConcert',
  'favoriteMeal',
  'childhoodDream',
];
let disposed = false,
  generation = 0;
function clearSecrets() {
  challenge.value = '';
  password.value = '';
  repeatPassword.value = '';
  answers.value = ['', '', '', '', ''];
}
function invalidateFlow() {
  generation++;
  clearSecrets();
  username.value = '';
  questions.value = [1, 2, 3, 4, 5];
  failed.value = false;
  busy.value = false;
  accepted.value = false;
}
watch(() => session.authVersion, invalidateFlow, { flush: 'sync' });
onUnmounted(() => {
  disposed = true;
  invalidateFlow();
});
async function register() {
  if (busy.value || challengeBusy.value || disposed) return;
  const ticket = ++generation;
  const version = session.authVersion;
  const current = () => !disposed && ticket === generation && version === session.authVersion;
  busy.value = true;
  failed.value = false;
  try {
    const { csrfToken } = await authClient.csrf();
    if (!current()) return;
    await authClient.register(
      {
        username: username.value,
        locale: locale.value,
        password: password.value,
        repeatPassword: repeatPassword.value,
        answers: questions.value.map((questionId, i) => ({ questionId, answer: answers.value[i] ?? '' })),
      },
      csrfToken,
      challenge.value || undefined,
    );
    if (!current()) return;
    accepted.value = true;
  } catch {
    if (current()) failed.value = true;
  } finally {
    if (ticket === generation) {
      clearSecrets();
      busy.value = false;
    }
  }
}
</script>
<template>
  <section class="mx-auto max-w-prose px-6 py-12" aria-labelledby="register-title">
    <h1 id="register-title" class="text-2xl font-semibold mb-4">{{ $t('auth.register') }}</h1>
    <RouterLink to="/_public/privacy">{{ $t('auth.privacy') }}</RouterLink>
    <RecoveryWarning @policy="captchaEnabled = $event" />
    <p>{{ $t('auth.passwordPolicy') }}</p>
    <p v-if="accepted" role="status">
      {{ $t('auth.registered') }} <RouterLink to="/_auth/login">{{ $t('signIn.title') }}</RouterLink>
    </p>
    <AuthChallenge
      v-if="!accepted"
      v-model="challenge"
      :enabled="captchaEnabled"
      :disabled="busy"
      purpose="register"
      @working="challengeBusy = $event"
    />
    <form v-if="!accepted" :aria-busy="busy" @submit.prevent="register">
      <fieldset :disabled="busy || challengeBusy" class="min-w-0 border-0 p-0">
        <label for="register-user">{{ $t('auth.username') }}</label
        ><input
          id="register-user"
          v-model="username"
          required
          maxlength="64"
          autocomplete="username"
          class="block border p-2 mb-4 w-full"
        />
        <label for="register-password">{{ $t('auth.password') }}</label
        ><input
          id="register-password"
          v-model="password"
          required
          type="password"
          minlength="12"
          maxlength="128"
          autocomplete="new-password"
          class="block border p-2 mb-4 w-full"
        />
        <label for="register-repeat">{{ $t('auth.repeatPassword') }}</label
        ><input
          id="register-repeat"
          v-model="repeatPassword"
          required
          type="password"
          autocomplete="new-password"
          class="block border p-2 mb-4 w-full"
        />
        <fieldset v-for="(_, index) in questions" :key="index" class="my-4 min-w-0">
          <legend>{{ $t('auth.securityQuestion', { number: index + 1 }) }}</legend>
          <label :for="`question-${index}`">{{ $t('auth.chooseQuestion') }}</label>
          <select
            :id="`question-${index}`"
            v-model="questions[index]"
            class="block w-full min-w-0 max-w-full border p-2"
          >
            <option v-for="(key, i) in keys" :key="key" :value="i + 1">{{ $t(`questions.${key}`) }}</option>
          </select>
          <label :for="`answer-${index}`">{{ $t('auth.answer') }}</label
          ><input
            :id="`answer-${index}`"
            v-model="answers[index]"
            required
            maxlength="256"
            autocomplete="off"
            class="block w-full min-w-0 max-w-full border p-2"
          />
        </fieldset>
        <p v-if="failed" role="alert">{{ $t('auth.rejected') }}</p>
        <v-btn type="submit" :disabled="busy || challengeBusy">{{ $t('auth.register') }}</v-btn>
      </fieldset>
    </form>
  </section>
</template>
