<script setup lang="ts">
// The admin namespace screen (UI-04), behind the UX-only role guard. Server-side role checks
// (ADM-01 … ADM-21) arrive with Phase 2; the guard here only keeps navigation honest.
</script>

<template>
  <section class="mx-auto max-w-prose px-6 py-16" aria-labelledby="admin-area-title">
    <h1 id="admin-area-title" class="text-2xl font-semibold mb-4">
      {{ $t('adminArea.title') }}
    </h1>
    <p>
      {{ $t('adminArea.placeholder') }}
    </p>
  </section>
</template>
