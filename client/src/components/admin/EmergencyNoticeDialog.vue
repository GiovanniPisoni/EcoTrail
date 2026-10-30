<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseCard from '@/components/base/BaseCard.vue'

defineProps({
  trailName: {
    type: String,
    required: true
  },
  status: {
    type: String,
    required: true,
    validator: (value) => ['at_risk', 'closed'].includes(value)
  },
  validatedReports: {
    type: Number,
    default: 0
  }
})

const emit = defineEmits(['close'])

const okButton = ref(null)

function onKeydown(event) {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  okButton.value?.$el.focus()
})

onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div class="emergency-dialog-backdrop" @click.self="emit('close')">
      <BaseCard
        class="emergency-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="emergency-dialog-title"
        aria-describedby="emergency-dialog-text"
      >
        <svg
          class="emergency-dialog__icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path
            d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
          />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <h2 id="emergency-dialog-title">
          {{ trailName }} is now {{ status === 'closed' ? 'closed' : 'at risk' }}
        </h2>
        <div id="emergency-dialog-text">
          <p>
            Nearby hikers who enabled emergency alerts are being notified. The notification contains
            the reason you wrote.
          </p>
          <p v-if="validatedReports > 0">
            {{ validatedReports }}
            {{ validatedReports === 1 ? 'connected report was' : 'connected reports were' }}
            validated.
          </p>
        </div>
        <div class="emergency-dialog__actions">
          <BaseButton ref="okButton" @click="emit('close')">OK</BaseButton>
        </div>
      </BaseCard>
    </div>
  </Teleport>
</template>

<style scoped>
.emergency-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: rgba(20, 30, 25, 0.45);
}

.emergency-dialog {
  width: 100%;
  max-width: 400px;
  text-align: center;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.25);
}

.emergency-dialog__icon {
  width: 3rem;
  height: 3rem;
  margin-bottom: 0.5rem;
  color: var(--color-status-closed, #ef4444);
}

.emergency-dialog h2 {
  margin: 0 0 0.5rem;
  font-family: var(--font-heading);
  font-weight: 400;
  font-size: 1.4rem;
  overflow-wrap: anywhere;
}

.emergency-dialog p {
  margin: 0 0 0.75rem;
  color: var(--color-text-muted);
  font-size: 0.95rem;
  line-height: 1.45;
}

.emergency-dialog__actions {
  display: flex;
  justify-content: center;
  margin-top: 1rem;
}
</style>
