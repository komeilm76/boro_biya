<template>
  <section class="mx-auto max-w-prose px-6 py-12" aria-labelledby="privacy-title">
    <h1 id="privacy-title" class="text-2xl font-semibold">{{ $t('privacy.title') }}</h1>
    <p class="my-4">{{ $t('privacy.development') }}</p>
    <p class="my-4">{{ $t('privacy.data') }}</p>
    <p class="my-4">{{ $t('privacy.retention') }}</p>
    <p class="my-4">{{ $t('privacy.sessions') }}</p>
    <RouterLink to="/_public/report">{{ $t('privacy.report') }}</RouterLink>
  </section>
</template>
