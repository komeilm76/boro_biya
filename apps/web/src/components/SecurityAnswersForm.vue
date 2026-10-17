<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { authClient } from '../auth-client.js';
import { useSessionStore } from '../stores/session.js';
const session = useSessionStore();
const router = useRouter();
const currentPassword = ref('');
const questions = ref([1, 2, 3, 4, 5]);
const answers = ref(['', '', '', '', '']);
const busy = ref(false);
const failed = ref(false);
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
async function submit() {
  if (busy.value) return;
  busy.value = true;
  failed.value = false;
  try {
    await authClient.changeSecurityAnswers(
      currentPassword.value,
      questions.value.map((questionId, index) => ({ questionId, answer: answers.value[index] ?? '' })),
      session.accessToken ?? '',
    );
    session.clearSession();
    await router.push('/_auth/login');
  } catch {
    failed.value = true;
  } finally {
    currentPassword.value = '';
    answers.value = ['', '', '', '', ''];
    busy.value = false;
  }
}
</script>
<template>
  <form class="my-6" :aria-busy="busy" @submit.prevent="submit">
    <h2>{{ $t('securityAnswers.title') }}</h2>
    <p>{{ $t('securityAnswers.notice') }}</p>
    <fieldset :disabled="busy" class="grid min-w-0 gap-3">
      <label for="answers-current-password">{{ $t('auth.currentPassword') }}</label>
      <input
        id="answers-current-password"
        v-model="currentPassword"
        type="password"
        autocomplete="current-password"
        required
        maxlength="128"
        class="w-full min-w-0 max-w-full"
      />
      <div v-for="(_, index) in questions" :key="index" class="grid min-w-0 gap-2">
        <label :for="`changed-question-${index}`">{{ $t('auth.securityQuestion', { number: index + 1 }) }}</label>
        <select
          :id="`changed-question-${index}`"
          v-model.number="questions[index]"
          class="w-full min-w-0 max-w-full"
          required
        >
          <option v-for="(key, option) in keys" :key="key" :value="option + 1">{{ $t(`questions.${key}`) }}</option>
        </select>
        <label :for="`changed-answer-${index}`">{{ $t('auth.answer', { number: index + 1 }) }}</label>
        <input
          :id="`changed-answer-${index}`"
          v-model="answers[index]"
          type="password"
          autocomplete="off"
          required
          maxlength="256"
          class="w-full min-w-0 max-w-full"
        />
      </div>
      <p v-if="failed" role="alert">{{ $t('auth.rejected') }}</p>
      <button type="submit">{{ $t('securityAnswers.submit') }}</button>
    </fieldset>
  </form>
</template>
