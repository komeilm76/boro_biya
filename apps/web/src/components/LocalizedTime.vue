<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { formatInstant } from '../i18n/time.js';
const props = defineProps<{ value: string }>();
const { locale } = useI18n();
const open = ref(false),
  id = useId();
watch(
  () => props.value,
  () => {
    open.value = false;
  },
);
const display = computed(() => {
  try {
    return formatInstant(props.value, locale.value);
  } catch {
    return null;
  }
});
</script>
<template>
  <span v-if="display" class="inline-flex flex-wrap items-center gap-2">
    <time :datetime="value" :aria-describedby="`${id}-precision`">{{ display }}</time>
    <span :id="`${id}-precision`" class="sr-only">{{ $t('time.precision') }}</span>
    <button
      type="button"
      :aria-expanded="open"
      :aria-controls="open ? `${id}-instant` : undefined"
      @click="open = !open"
    >
      {{ $t('time.inspect') }}
    </button>
    <span v-if="open" :id="`${id}-instant`"
      >{{ $t('time.utc') }} <code dir="ltr">{{ value }}</code></span
    >
  </span>
  <span v-else>{{ $t('time.unavailable') }}</span>
</template>
