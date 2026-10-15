<script setup lang="ts">
// The sign-in namespace screen (UI-01). Phase 1 has no authentication (GOV-02): this page says
// so honestly instead of rendering a form that cannot work. Phase 2 replaces it with the real
// sign-in flow (AUTH-01 …) behind the same route.
</script>

<template>
  <section class="mx-auto max-w-prose px-6 py-16 text-center" aria-labelledby="sign-in-title">
    <h1 id="sign-in-title" class="text-2xl font-semibold mb-4">
      {{ $t('signIn.title') }}
    </h1>
    <p>
      {{ $t('signIn.unavailable') }}
    </p>
  </section>
</template>
