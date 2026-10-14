<template>
  <section aria-labelledby="help-title">
    <h1 id="help-title">{{ t('help.title') }}</h1>
    <p>{{ t('help.body') }}</p>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n({ useScope: 'global' });
</script>
