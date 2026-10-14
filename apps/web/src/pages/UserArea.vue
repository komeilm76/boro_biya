<script setup lang="ts">
// The user namespace screen (UI-03), behind the UX-only authentication guard. When protected
// data arrives, the route revalidates access through the API on load (UI-06) — the guard is
// never the authorization decision.
</script>

<template>
  <section class="mx-auto max-w-prose px-6 py-16" aria-labelledby="user-area-title">
    <h1 id="user-area-title" class="text-2xl font-semibold mb-4">
      {{ $t('userArea.title') }}
    </h1>
    <p>
      {{ $t('userArea.placeholder') }}
    </p>
  </section>
</template>
