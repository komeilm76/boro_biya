<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { authClient } from '../auth-client.js';
import { useSessionStore } from '../stores/session.js';

const session = useSessionStore();
const stage = ref<'username' | 'answers' | 'reset' | 'done'>('username');
const enabled = ref(false);
const ready = ref(false);
const busy = ref(false);
const failed = ref(false);
const username = ref('');
const questions = ref<Array<{ id: number; textKey: string }>>([]);
const answers = ref<string[]>([]);
const password = ref('');
const repeatPassword = ref('');

onMounted(async () => {
  try {
    enabled.value = (await authClient.recoveryPolicy()).recoveryEnabled;
  } catch {
    failed.value = true;
  } finally {
    ready.value = true;
  }
});

function restart() {
  stage.value = 'username';
  questions.value = [];
  answers.value = [];
  password.value = '';
  repeatPassword.value = '';
  failed.value = false;
}

async function submit() {
  if (busy.value || !enabled.value) return;
  busy.value = true;
  failed.value = false;
  try {
    const { csrfToken } = await authClient.csrf();
    if (stage.value === 'username') {
      await authClient.forgot(username.value, csrfToken);
      questions.value = await authClient.recoveryQuestions(csrfToken);
      answers.value = questions.value.map(() => '');
      stage.value = 'answers';
    } else if (stage.value === 'answers') {
      await authClient.verifyRecovery(
        questions.value.map((question, index) => ({ questionId: question.id, answer: answers.value[index] ?? '' })),
        csrfToken,
      );
      answers.value = [];
      stage.value = 'reset';
    } else if (stage.value === 'reset') {
      await authClient.resetPassword(password.value, repeatPassword.value, csrfToken);
      session.clearSession();
      stage.value = 'done';
    }
  } catch {
    failed.value = true;
  } finally {
    password.value = '';
    repeatPassword.value = '';
    busy.value = false;
  }
}
</script>

<template>
  <section class="p-6 max-w-xl">
    <h1>{{ $t('recovery.title') }}</h1>
    <p role="note" class="my-4">{{ $t('auth.recoveryWarning') }}</p>
    <p v-if="ready && !enabled" role="status">{{ $t('recovery.disabled') }}</p>
    <p v-if="failed" role="alert">{{ $t('recovery.failed') }}</p>
    <p v-if="stage === 'done'" role="status">{{ $t('recovery.done') }}</p>
    <form v-else-if="enabled" :aria-busy="busy" @submit.prevent="submit">
      <fieldset :disabled="busy" class="grid gap-3">
        <template v-if="stage === 'username'">
          <label for="recovery-username">{{ $t('auth.username') }}</label>
          <input id="recovery-username" v-model="username" autocomplete="username" required maxlength="32" />
          <button type="submit">{{ $t('recovery.start') }}</button>
        </template>
        <template v-else-if="stage === 'answers'">
          <legend>{{ $t('recovery.answers') }}</legend>
          <div v-for="(question, index) in questions" :key="question.id" class="grid gap-2">
            <label :for="`recovery-answer-${question.id}`">{{ $t(question.textKey) }}</label>
            <input
              :id="`recovery-answer-${question.id}`"
              v-model="answers[index]"
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
            type="password"
            autocomplete="new-password"
            required
            maxlength="128"
          />
          <label for="recovery-repeat">{{ $t('auth.repeatPassword') }}</label>
          <input
            id="recovery-repeat"
            v-model="repeatPassword"
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
