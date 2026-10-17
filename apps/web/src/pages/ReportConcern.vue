<template>
  <section class="mx-auto max-w-prose px-6 py-12" aria-labelledby="report-title">
    <h1 id="report-title" class="text-2xl font-semibold">{{ $t('report.title') }}</h1>
    <p class="my-4">{{ $t('report.body') }}</p>
    <a href="https://github.com/komeilm76/boro_biya/security/advisories/new" rel="noopener noreferrer">{{
      $t('report.privateLink')
    }}</a>
    <p class="my-4">{{ $t('report.warning') }}</p>
  </section>
</template>
