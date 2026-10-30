<script setup></script>

<template>
  <div class="base-card">
    <slot />
  </div>
</template>

<style scoped>
.base-card {
  background-color: var(--color-surface);
  border-radius: var(--radius-card);
  padding: 1rem;
  border: 1px solid var(--color-card-border);
  box-shadow: 0 1px 4px rgba(26, 62, 47, 0.12);
}
</style>
