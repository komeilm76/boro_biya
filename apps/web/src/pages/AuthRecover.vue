<script setup lang="ts">
import AuthChallenge from '../components/AuthChallenge.vue';
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { authClient } from '../auth-client.js';
import { useSessionStore } from '../stores/session.js';

const session = useSessionStore();
const stage = ref<'username' | 'answers' | 'reset' | 'done'>('username');
const enabled = ref(false);
const ready = ref(false);
const captchaEnabled = ref(false);
const challenge = ref('');
const challengeBusy = ref(false);
const busy = ref(false);
const failed = ref(false);
const username = ref('');
const questions = ref<Array<{ id: number; textKey: string }>>([]);
const answers = ref<string[]>([]);
const password = ref('');
const repeatPassword = ref('');

let disposed = false,
  generation = 0;
function clearSecrets() {
  challenge.value = '';
  answers.value = answers.value.map(() => '');
  password.value = '';
  repeatPassword.value = '';
}
function invalidateFlow() {
  generation++;
  clearSecrets();
  username.value = '';
  questions.value = [];
  answers.value = [];
  stage.value = 'username';
  failed.value = false;
  busy.value = false;
}
watch(() => session.authVersion, invalidateFlow, { flush: 'sync' });
onUnmounted(() => {
  disposed = true;
  invalidateFlow();
});

onMounted(async () => {
  try {
    const policy = await authClient.recoveryPolicy();
    if (disposed) return;
    enabled.value = policy.recoveryEnabled;
    captchaEnabled.value = policy.captchaEnabled === true;
  } catch {
    if (!disposed) failed.value = true;
  } finally {
    if (!disposed) ready.value = true;
  }
});

function restart() {
  if (busy.value || challengeBusy.value || disposed) return;
  generation++;
  clearSecrets();
  stage.value = 'username';
  questions.value = [];
  answers.value = [];
  password.value = '';
  repeatPassword.value = '';
  failed.value = false;
}

async function submit() {
  if (busy.value || challengeBusy.value || !enabled.value || disposed) return;
  const ticket = ++generation;
  const version = session.authVersion;
  const current = () => !disposed && ticket === generation && version === session.authVersion;
  busy.value = true;
  failed.value = false;
  try {
    const { csrfToken } = await authClient.csrf();
    if (!current()) return;
    if (stage.value === 'username') {
      await authClient.forgot(username.value, csrfToken, challenge.value || undefined);
      if (!current()) return;
      const catalogue = await authClient.recoveryQuestions(csrfToken);
      if (!current()) return;
      questions.value = catalogue;
      answers.value = questions.value.map(() => '');
      stage.value = 'answers';
    } else if (stage.value === 'answers') {
      await authClient.verifyRecovery(
        questions.value.map((question, index) => ({ questionId: question.id, answer: answers.value[index] ?? '' })),
        csrfToken,
      );
      if (!current()) return;
      answers.value = [];
      stage.value = 'reset';
    } else if (stage.value === 'reset') {
      await authClient.resetPassword(password.value, repeatPassword.value, csrfToken);
      if (!current()) return;
      session.clearSession();
      stage.value = 'done';
    }
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
  <section class="p-6 max-w-xl wrap-anywhere">
    <h1>{{ $t('recovery.title') }}</h1>
    <p role="note" class="my-4">{{ $t('auth.recoveryWarning') }}</p>
    <p v-if="ready && !enabled" role="status">{{ $t('recovery.disabled') }}</p>
    <p v-if="failed" role="alert">{{ $t('recovery.failed') }}</p>
    <p v-if="stage === 'done'" role="status">{{ $t('recovery.done') }}</p>
    <AuthChallenge
      v-if="stage === 'username'"
      v-model="challenge"
      :enabled="captchaEnabled"
      :disabled="busy"
      purpose="recovery"
      @working="challengeBusy = $event"
    />
    <form v-if="enabled && stage !== 'done'" :aria-busy="busy" @submit.prevent="submit">
      <fieldset :disabled="busy || challengeBusy" class="grid min-w-0 gap-3">
        <template v-if="stage === 'username'">
          <label for="recovery-username">{{ $t('auth.username') }}</label>
          <input
            id="recovery-username"
            v-model="username"
            class="w-full min-w-0 max-w-full"
            autocomplete="username"
            required
            maxlength="64"
          />
          <button type="submit">{{ $t('recovery.start') }}</button>
        </template>
        <template v-else-if="stage === 'answers'">
          <legend>{{ $t('recovery.answers') }}</legend>
          <div v-for="(question, index) in questions" :key="question.id" class="grid min-w-0 gap-2">
            <label :for="`recovery-answer-${question.id}`">{{ $t(question.textKey) }}</label>
            <input
              :id="`recovery-answer-${question.id}`"
              v-model="answers[index]"
              class="w-full min-w-0 max-w-full"
              type="password"
              autocomplete="off"
              required
              maxlength="256"
            />
          </div>
          <button type="submit">{{ $t('recovery.verify') }}</button>
        </template>
        <template v-else-if="stage === 'reset'">
          <p>{{ $t('auth.passwordPolicy') }}</p>
          <label for="recovery-password">{{ $t('auth.password') }}</label>
          <input
            id="recovery-password"
            v-model="password"
            class="w-full min-w-0 max-w-full"
            type="password"
            autocomplete="new-password"
            required
            maxlength="128"
          />
          <label for="recovery-repeat">{{ $t('auth.repeatPassword') }}</label>
          <input
            id="recovery-repeat"
            v-model="repeatPassword"
            class="w-full min-w-0 max-w-full"
            type="password"
            autocomplete="new-password"
            required
            maxlength="128"
          />
          <button type="submit">{{ $t('recovery.reset') }}</button>
        </template>
        <button v-if="stage !== 'username'" type="button" @click="restart">{{ $t('recovery.restart') }}</button>
      </fieldset>
    </form>
    <RouterLink to="/_auth/login" class="block mt-4">{{ $t('signIn.title') }}</RouterLink>
  </section>
</template>
