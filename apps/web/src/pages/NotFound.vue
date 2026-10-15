<script setup lang="ts">
import { CLIENT_ROUTE_NAMESPACES } from '@boro-biya/contracts';

// The safe not-found page (UI-07): it never reveals whether a resource exists, never echoes the
// requested path (no reflected content, no enumeration signal), and offers one neutral way out.
const homePath: string = CLIENT_ROUTE_NAMESPACES.public;
</script>

<template>
  <section class="mx-auto max-w-prose px-6 py-16 text-center" aria-labelledby="not-found-title">
    <h1 id="not-found-title" class="text-2xl font-semibold mb-4">
      {{ $t('notFound.title') }}
    </h1>
    <p class="mb-8">
      {{ $t('notFound.body') }}
    </p>
    <RouterLink class="app-link" :to="homePath">
      {{ $t('notFound.action') }}
    </RouterLink>
  </section>
</template>
