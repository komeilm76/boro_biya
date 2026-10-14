<template>
  <section aria-labelledby="not-found-title">
    <h1 id="not-found-title">{{ t('notFound.title') }}</h1>
    <p>{{ t('notFound.body') }}</p>
    <RouterLink :to="{ name: 'home' }">{{ t('nav.home') }}</RouterLink>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n({ useScope: 'global' });
</script>
