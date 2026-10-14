<template>
  <section aria-labelledby="admin-home-title">
    <h1 id="admin-home-title">{{ t('admin.home.title') }}</h1>
    <p>{{ t('admin.home.body') }}</p>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n({ useScope: 'global' });
</script>
