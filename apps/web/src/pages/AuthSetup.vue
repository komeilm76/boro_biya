<script setup lang="ts">
import { ref } from 'vue';
import { authClient } from '../auth-client.js';
import RecoveryWarning from '../components/RecoveryWarning.vue';
const stage = ref<'start' | 'password' | 'questions' | 'done'>('start');
const username = ref('');
const password = ref('');
const repeatPassword = ref('');
const questions = ref([1, 2, 3, 4, 5]);
const answers = ref(['', '', '', '', '']);
const failed = ref(false);
const busy = ref(false);
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
async function resume() {
  if (busy.value) return;
  busy.value = true;
  failed.value = false;
  try {
    const state = await authClient.setupStatus();
    stage.value = state.passwordSetupRequired ? 'password' : 'questions';
  } catch {
    failed.value = true;
  } finally {
    busy.value = false;
  }
}
async function submit() {
  if (busy.value) return;
  busy.value = true;
  failed.value = false;
  try {
    const { csrfToken } = await authClient.csrf();
    if (stage.value === 'start') {
      await authClient.setupStart(username.value, password.value, csrfToken);
      stage.value = 'password';
    } else if (stage.value === 'password') {
      await authClient.setupPassword(password.value, repeatPassword.value, csrfToken);
      stage.value = 'questions';
    } else if (stage.value === 'questions') {
      await authClient.setupSecurity(
        questions.value.map((questionId, index) => ({ questionId, answer: answers.value[index] ?? '' })),
        csrfToken,
      );
      stage.value = 'done';
    }
  } catch {
    failed.value = true;
  } finally {
    password.value = '';
    repeatPassword.value = '';
    answers.value = ['', '', '', '', ''];
    busy.value = false;
  }
}
</script>
<template>
  <section class="mx-auto max-w-prose p-6">
    <h1>{{ $t('setup.title') }}</h1>
    <p>{{ $t('setup.notice') }}</p>
    <RecoveryWarning />
    <p v-if="failed" role="alert">{{ $t('auth.rejected') }}</p>
    <p v-if="stage === 'done'" role="status">{{ $t('setup.done') }}</p>
    <form v-else :aria-busy="busy" @submit.prevent="submit">
      <fieldset :disabled="busy" class="grid gap-3">
        <template v-if="stage === 'start'">
          <label for="setup-username">{{ $t('auth.username') }}</label>
          <input id="setup-username" v-model="username" autocomplete="username" required maxlength="64" />
          <label for="setup-password">{{ $t('auth.password') }}</label>
          <input
            id="setup-password"
            v-model="password"
            type="password"
            autocomplete="current-password"
            required
            maxlength="128"
          />
          <button type="submit">{{ $t('setup.title') }}</button>
          <button type="button" @click="resume">{{ $t('setup.resume') }}</button>
        </template>
        <template v-else-if="stage === 'password'">
          <legend>{{ $t('setup.password') }}</legend>
          <p>{{ $t('auth.passwordPolicy') }}</p>
          <label for="setup-new-password">{{ $t('auth.password') }}</label>
          <input
            id="setup-new-password"
            v-model="password"
            type="password"
            autocomplete="new-password"
            required
            maxlength="128"
          />
          <label for="setup-repeat-password">{{ $t('auth.repeatPassword') }}</label>
          <input
            id="setup-repeat-password"
            v-model="repeatPassword"
            type="password"
            autocomplete="new-password"
            required
            maxlength="128"
          />
          <button type="submit">{{ $t('setup.password') }}</button>
        </template>
        <template v-else-if="stage === 'questions'">
          <legend>{{ $t('setup.questions') }}</legend>
          <div v-for="(_, index) in questions" :key="index" class="grid gap-2">
            <label :for="`setup-question-${index}`">{{ $t('auth.securityQuestion', { number: index + 1 }) }}</label>
            <select :id="`setup-question-${index}`" v-model.number="questions[index]" required>
              <option v-for="(key, option) in keys" :key="key" :value="option + 1">{{ $t(`questions.${key}`) }}</option>
            </select>
            <label :for="`setup-answer-${index}`">{{ $t('auth.answer') }}</label>
            <input
              :id="`setup-answer-${index}`"
              v-model="answers[index]"
              type="password"
              autocomplete="off"
              required
              maxlength="256"
            />
          </div>
          <button type="submit">{{ $t('setup.complete') }}</button>
        </template>
      </fieldset>
    </form>
    <RouterLink to="/_auth/login">{{ $t('signIn.title') }}</RouterLink>
  </section>
</template>
