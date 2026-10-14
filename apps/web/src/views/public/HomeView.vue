<template>
  <section aria-labelledby="home-title">
    <h1 id="home-title">{{ t('home.title') }}</h1>
    <p>{{ t('home.body') }}</p>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n({ useScope: 'global' });
</script>
