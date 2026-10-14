<template>
  <div class="shell" :dir="locale === 'fa' ? 'rtl' : 'ltr'">
    <header class="site-header">
      <RouterLink class="brand" :to="{ name: 'home' }">{{ t('appTitle') }}</RouterLink>
      <nav class="navigation" :aria-label="t('nav.label')">
        <RouterLink :to="{ name: 'home' }">{{ t('nav.home') }}</RouterLink>
        <RouterLink :to="{ name: 'help' }">{{ t('nav.help') }}</RouterLink>
        <RouterLink :to="{ name: 'login' }">{{ t('nav.signIn') }}</RouterLink>
      </nav>
      <label class="language-picker">
        <span>{{ t('nav.language') }}</span>
        <select v-model="locale" :aria-label="t('nav.language')">
          <option value="en">{{ t('language.english') }}</option>
          <option value="fa">{{ t('language.persian') }}</option>
        </select>
      </label>
    </header>
    <main id="main-content" class="content">
      <RouterView />
    </main>
    <footer class="site-footer">{{ t('footer.phase') }}</footer>
  </div>
</template>

<script setup lang="ts">
import { watchEffect } from 'vue';
import { useI18n } from 'vue-i18n';

const { t, locale } = useI18n({ useScope: 'global' });

watchEffect(() => {
  document.documentElement.lang = locale.value;
  document.documentElement.dir = locale.value === 'fa' ? 'rtl' : 'ltr';
});
</script>

<style>
:root {
  color: #1a2b36;
  background: #f4f7f8;
  font-family: system-ui, sans-serif;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 20rem;
  min-height: 100vh;
}

button,
select,
a {
  font: inherit;
}

a {
  color: #15536f;
}

a:focus-visible,
select:focus-visible {
  outline: 3px solid #d57b26;
  outline-offset: 3px;
}

.shell {
  display: flex;
  min-height: 100vh;
  flex-direction: column;
}

.site-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  padding: 1rem clamp(1rem, 4vw, 3rem);
  background: #173a52;
  color: #fff;
}

.brand {
  color: inherit;
  font-size: 1.25rem;
  font-weight: 700;
  text-decoration: none;
}

.navigation {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

.navigation a {
  color: inherit;
  text-decoration-thickness: 0.08em;
  text-underline-offset: 0.25em;
}

.language-picker {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.content {
  width: min(100% - 2rem, 64rem);
  margin-inline: auto;
  padding-block: 3rem;
  flex: 1;
}

.content section {
  padding: clamp(1.25rem, 4vw, 3rem);
  border: 1px solid #d8e2e7;
  border-radius: 1rem;
  background: #fff;
  box-shadow: 0 0.75rem 2rem rgb(23 58 82 / 8%);
}

.site-footer {
  padding: 1rem;
  color: #405866;
  text-align: center;
}

@media (max-width: 42rem) {
  .site-header {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
