<script setup lang="ts">
import LanguageSwitcher from './components/LanguageSwitcher.vue';
import { RouterView } from 'vue-router';
</script>

<template>
  <v-app>
    <v-main>
      <LanguageSwitcher />
      <RouterView />
    </v-main>
  </v-app>
</template>
