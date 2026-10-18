<script setup lang="ts">
import SecurityNoticeStream from './components/SecurityNoticeStream.vue';
import LanguageSwitcher from './components/LanguageSwitcher.vue';
import { RouterView } from 'vue-router';
</script>

<template>
  <v-app>
    <v-main>
      <LanguageSwitcher />
      <SecurityNoticeStream />
      <RouterView />
    </v-main>
  </v-app>
</template>
