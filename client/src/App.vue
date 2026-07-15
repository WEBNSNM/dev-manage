<script setup lang="ts">
import { useCountdownReminder } from './utils/useCountdownReminder';

useCountdownReminder();
</script>

<template>
  <GlobalToast />
  <GlobalConfirm />
  <router-view></router-view>
</template>

<style scoped>
</style>
