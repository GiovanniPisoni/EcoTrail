<script setup>
defineProps({
  variant: {
    type: String,
    default: 'primary',
    validator: (value) => ['primary', 'secondary'].includes(value)
  }
})
</script>

<template>
  <button class="base-button" :class="`base-button--${variant}`">
    <slot />
  </button>
</template>

<style scoped>
.base-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  padding: 0.9rem 1.5rem;
  border-radius: var(--radius-pill);
  border: 2px solid transparent;
  font-family: var(--font-body);
  font-weight: 600;
  font-size: 1rem;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.base-button--primary {
  background-color: var(--color-primary);
  color: var(--color-surface);
}

.base-button--primary:hover,
.base-button--primary:active {
  background-color: var(--color-primary-pressed);
}

.base-button--secondary {
  background-color: transparent;
  color: var(--color-primary);
  border-color: var(--color-primary);
}

.base-button--secondary:hover,
.base-button--secondary:active {
  background-color: var(--color-background);
}

.base-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
