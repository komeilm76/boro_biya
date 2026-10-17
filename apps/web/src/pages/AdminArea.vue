<script setup lang="ts">
import AdminCreateAccount from '../components/AdminCreateAccount.vue';
</script>

<template>
  <section class="mx-auto max-w-prose px-6 py-16" aria-labelledby="admin-area-title">
    <h1 id="admin-area-title" class="text-2xl font-semibold mb-4">
      {{ $t('adminArea.title') }}
    </h1>
    <AdminCreateAccount />
    <p>
      {{ $t('adminArea.placeholder') }}
    </p>
  </section>
</template>
