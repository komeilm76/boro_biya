<script setup lang="ts">
import { onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { securityReportSchema } from '@boro-biya/validation';
import { authClient, AuthRequestError } from '../auth-client.js';
const { locale } = useI18n();
const category = ref('account_compromise'),
  message = ref('');
const busy = ref(false),
  accepted = ref(false),
  failure = ref('');
let disposed = false;
onUnmounted(() => {
  disposed = true;
  message.value = '';
});
async function submit() {
  if (busy.value || disposed) return;
  accepted.value = false;
  failure.value = '';
  const parsed = securityReportSchema.safeParse({
    category: category.value,
    message: message.value,
    locale: locale.value,
  });
  if (!parsed.success) {
    failure.value = 'report.invalid';
    return;
  }
  busy.value = true;
  try {
    const { csrfToken } = await authClient.csrf();
    if (disposed) return;
    await authClient.reportSecurity(parsed.data, csrfToken);
    if (!disposed) {
      accepted.value = true;
      message.value = '';
    }
  } catch (error) {
    if (!disposed)
      failure.value = error instanceof AuthRequestError && error.status === 429 ? 'report.limited' : 'report.failed';
  } finally {
    if (!disposed) busy.value = false;
  }
}
</script>
<template>
  <section class="mx-auto max-w-prose px-6 py-12" aria-labelledby="report-title">
    <h1 id="report-title" class="text-2xl font-semibold">{{ $t('report.title') }}</h1>
    <p class="my-4">{{ $t('report.body') }}</p>
    <p id="report-warning" class="my-4">{{ $t('report.warning') }}</p>
    <p class="my-4">{{ $t('report.expectation') }}</p>
    <form :aria-busy="busy" @submit.prevent="submit">
      <label for="report-category">{{ $t('report.category') }}</label>
      <select id="report-category" v-model="category" :disabled="busy">
        <option value="account_compromise">{{ $t('report.compromise') }}</option>
        <option value="abuse">{{ $t('report.abuse') }}</option>
        <option value="vulnerability">{{ $t('report.vulnerability') }}</option>
      </select>
      <label for="report-message">{{ $t('report.message') }}</label>
      <textarea
        id="report-message"
        v-model="message"
        required
        minlength="20"
        maxlength="4000"
        :disabled="busy"
        aria-describedby="report-warning"
        class="block border p-2 w-full"
      />
      <button type="submit" :disabled="busy">{{ $t(busy ? 'report.sending' : 'report.submit') }}</button>
    </form>
    <p v-if="accepted" role="status">{{ $t('report.accepted') }}</p>
    <p v-if="failure" role="alert">{{ $t(failure) }}</p>
    <a href="https://github.com/komeilm76/boro_biya/security/advisories/new" rel="noopener noreferrer">{{
      $t('report.privateLink')
    }}</a>
  </section>
</template>
