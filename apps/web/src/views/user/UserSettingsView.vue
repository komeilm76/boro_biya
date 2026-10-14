<template>
  <section aria-labelledby="settings-title">
    <h1 id="settings-title">{{ t('user.settings.title') }}</h1>
    <p>{{ t('user.settings.body') }}</p>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n({ useScope: 'global' });
</script>
