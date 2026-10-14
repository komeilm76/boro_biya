<template>
  <section aria-labelledby="login-title">
    <h1 id="login-title">{{ t('login.title') }}</h1>
    <p>{{ t('login.body') }}</p>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n({ useScope: 'global' });
</script>
