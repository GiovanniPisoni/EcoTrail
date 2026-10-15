<script setup>
import BaseButton from '@/components/base/BaseButton.vue'
import BaseCard from '@/components/base/BaseCard.vue'

defineProps({
  state: {
    type: String,
    required: true,
    validator: (value) => ['prompt', 'denied'].includes(value)
  }
})

const emit = defineEmits(['confirm', 'close'])
</script>

<template>
  <Teleport to="body">
    <div class="location-dialog-backdrop" @click.self="emit('close')">
      <BaseCard
        class="location-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="location-dialog-title"
      >
        <template v-if="state === 'denied'">
          <h2 id="location-dialog-title">Location is blocked</h2>
          <p>
            Your browser has blocked the location for EcoTrail. To turn it on, tap the icon next to
            the address bar, open Site settings, set Location to Allow and then try again.
          </p>
          <div class="location-dialog__actions">
            <BaseButton variant="primary" @click="emit('close')">OK</BaseButton>
          </div>
        </template>

        <template v-else>
          <h2 id="location-dialog-title">Use your location?</h2>
          <p>
            EcoTrail needs your location to center the map on you. Your browser will ask you to
            confirm.
          </p>
          <div class="location-dialog__actions">
            <BaseButton variant="secondary" @click="emit('close')">Not now</BaseButton>
            <BaseButton variant="primary" @click="emit('confirm')">Yes, use my location</BaseButton>
          </div>
        </template>
      </BaseCard>
    </div>
  </Teleport>
</template>

<style scoped>
.location-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: rgba(20, 30, 25, 0.45);
}

.location-dialog {
  width: 100%;
  max-width: 380px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.25);
}

.location-dialog h2 {
  margin: 0 0 0.5rem;
  font-family: var(--font-heading);
  font-weight: 400;
  font-size: 1.4rem;
}

.location-dialog p {
  margin: 0 0 1.25rem;
  color: var(--color-text-muted);
  font-size: 0.95rem;
  line-height: 1.45;
}

.location-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

@media (max-width: 480px) {
  .location-dialog__actions {
    flex-direction: column-reverse;
  }
}
</style>
