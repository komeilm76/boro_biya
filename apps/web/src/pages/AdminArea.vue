<script setup lang="ts">
import { useSessionStore } from '../stores/session.js';
import AdminManagement from '../components/AdminManagement.vue';
import AdminCreateAccount from '../components/AdminCreateAccount.vue';
const session = useSessionStore();
</script>

<template>
  <section class="mx-auto max-w-prose px-6 py-16" aria-labelledby="admin-area-title">
    <h1 id="admin-area-title" class="text-2xl font-semibold mb-4">
      {{ $t('adminArea.title') }}
    </h1>
    <AdminCreateAccount v-if="session.permissions?.includes('users.create')" />
    <AdminManagement />
    <p>
      {{ $t('adminArea.placeholder') }}
    </p>
  </section>
</template>
