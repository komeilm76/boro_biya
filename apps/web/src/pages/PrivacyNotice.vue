<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { authClient } from '../auth-client.js';
const { locale } = useI18n();
const policy = ref<Awaited<ReturnType<typeof authClient.privacyPolicy>> | null>(null);
const failed = ref(false);
let disposed = false;
onUnmounted(() => {
  disposed = true;
});
onMounted(async () => {
  try {
    const result = await authClient.privacyPolicy();
    if (!disposed) policy.value = result;
  } catch {
    if (!disposed) failed.value = true;
  }
});
function number(value: number) {
  return new Intl.NumberFormat(locale.value === 'fa' ? 'fa-IR' : 'en-GB').format(value);
}
</script>
<template>
  <section class="mx-auto max-w-prose px-6 py-12" aria-labelledby="privacy-title">
    <h1 id="privacy-title" class="text-2xl font-semibold">{{ $t('privacy.title') }}</h1>
    <p class="my-4">{{ $t('privacy.development') }}</p>
    <p class="my-4">{{ $t('privacy.data') }}</p>
    <p class="my-4">{{ $t('privacy.retention') }}</p>
    <p v-if="failed" role="alert">{{ $t('privacy.unavailable') }}</p>
    <p v-else-if="!policy" role="status">{{ $t('privacy.loading') }}</p>
    <div v-if="policy" data-policy="effective" class="my-4">
      <p>
        {{
          $t('privacy.sessions', {
            access: number(policy.accessTtlSeconds),
            refresh: number(policy.refreshTtlSeconds),
            login: number(policy.loginWindowSeconds),
          })
        }}
      </p>
      <p>{{ $t(policy.automatedDeletionRequested ? 'privacy.requestedOn' : 'privacy.requestedOff') }}</p>
      <p>
        {{
          $t(policy.challengeCleanupEnabled ? 'privacy.cleanupOn' : 'privacy.cleanupOff', {
            grace: number(policy.challengeCleanupGraceSeconds),
          })
        }}
      </p>
      <p>
        {{
          $t('privacy.candidates', {
            audit: number(policy.auditDaysCandidate),
            operational: number(policy.operationalDaysCandidate),
          })
        }}
      </p>
      <p v-if="policy.recoveryEnabled">
        {{
          $t('privacy.recoveryWindows', {
            challenge: number(policy.recoveryChallengeTtlSeconds),
            grant: number(policy.recoveryGrantTtlSeconds),
          })
        }}
      </p>
      <p v-else>{{ $t('recovery.disabled') }}</p>
      <p v-if="policy.captchaEnabled && policy.captchaTtlSeconds">
        {{ $t('privacy.captchaWindow', { seconds: number(policy.captchaTtlSeconds) }) }}
      </p>
      <p>
        {{
          $t('privacy.streamWindows', {
            ticket: number(policy.securityStreamTicketTtlSeconds),
            stream: number(policy.securityStreamMaxSeconds),
          })
        }}
      </p>
      <p>{{ $t('privacy.unapproved') }}</p>
    </div>
    <RouterLink to="/_public/report">{{ $t('privacy.report') }}</RouterLink>
  </section>
</template>
