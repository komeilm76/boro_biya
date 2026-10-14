<template>
  <section aria-labelledby="user-home-title">
    <h1 id="user-home-title">{{ t('user.home.title') }}</h1>
    <p>{{ t('user.home.body') }}</p>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n({ useScope: 'global' });
</script>
