<script setup lang="ts">
// The public namespace screen (UI-02). Strings come from the catalogues (GOV-63).
</script>

<template>
  <section class="mx-auto max-w-prose px-6 py-16" aria-labelledby="landing-title">
    <h1 id="landing-title" class="text-2xl font-semibold mb-4">
      {{ $t('publicLanding.title') }}
    </h1>
    <p class="mb-8">
      {{ $t('publicLanding.body') }}
    </p>
    <nav class="flex gap-4" :aria-label="$t('nav.toPublic')">
      <RouterLink class="app-link" :to="{ name: 'auth-sign-in' }">{{ $t('signIn.title') }}</RouterLink>
      <RouterLink class="app-link" :to="{ name: 'user-area' }">{{ $t('userArea.title') }}</RouterLink>
      <RouterLink class="app-link" :to="{ name: 'admin-area' }">{{ $t('adminArea.title') }}</RouterLink>
    </nav>
  </section>
</template>
