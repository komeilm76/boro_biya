<script setup lang="ts">
import { ref } from 'vue';
import { authClient, authRequest, acceptedResponse } from '../auth-client.js';
const username = ref('');
const password = ref('');
const repeatPassword = ref('');
const questions = ref([1, 2, 3, 4, 5]);
const answers = ref(['', '', '', '', '']);
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
async function register() {
  if (busy.value) return;
  busy.value = true;
  failed.value = false;
  try {
    const { csrfToken } = await authClient.csrf();
    await authRequest('/api/v1/auth/register', acceptedResponse, {
      method: 'POST',
      csrf: csrfToken,
      body: {
        username: username.value,
        password: password.value,
        repeatPassword: repeatPassword.value,
        answers: questions.value.map((questionId, i) => ({ questionId, answer: answers.value[i] ?? '' })),
      },
    });
    accepted.value = true;
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
  <section class="mx-auto max-w-prose px-6 py-12" aria-labelledby="register-title">
    <h1 id="register-title" class="text-2xl font-semibold mb-4">{{ $t('auth.register') }}</h1>
    <RouterLink to="/_public/privacy">{{ $t('auth.privacy') }}</RouterLink>
    <p>{{ $t('auth.recoveryWarning') }}</p>
    <p>{{ $t('auth.passwordPolicy') }}</p>
    <p v-if="accepted" role="status">
      {{ $t('auth.registered') }} <RouterLink to="/_auth/login">{{ $t('signIn.title') }}</RouterLink>
    </p>
    <form v-else @submit.prevent="register">
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
      <fieldset v-for="(_, index) in questions" :key="index" class="my-4">
        <legend>{{ $t('auth.securityQuestion', { number: index + 1 }) }}</legend>
        <label :for="`question-${index}`">{{ $t('auth.chooseQuestion') }}</label>
        <select :id="`question-${index}`" v-model="questions[index]" class="block border p-2 w-full">
          <option v-for="(key, i) in keys" :key="key" :value="i + 1">{{ $t(`questions.${key}`) }}</option>
        </select>
        <label :for="`answer-${index}`">{{ $t('auth.answer') }}</label
        ><input
          :id="`answer-${index}`"
          v-model="answers[index]"
          required
          maxlength="256"
          autocomplete="off"
          class="block border p-2 w-full"
        />
      </fieldset>
      <p v-if="failed" role="alert">{{ $t('auth.rejected') }}</p>
      <v-btn type="submit" :disabled="busy">{{ $t('auth.register') }}</v-btn>
    </form>
  </section>
</template>
