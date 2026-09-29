<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import api from '@/api/client.js'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseCard from '@/components/base/BaseCard.vue'
import LocationPicker from '@/components/LocationPicker.vue'
import { REPORT_SEVERITY_OPTIONS, REPORT_TYPE_OPTIONS } from '@/config/reportOptions.js'

const emit = defineEmits(['close'])

const selectedType = ref(null)
const selectedSeverity = ref(null)
const description = ref('')

const latitude = ref(null)
const longitude = ref(null)
const accuracyMeters = ref(null)
const locationError = ref('')
const locatingUser = ref(false)

const photoFile = ref(null)
const photoPreviewUrl = ref(null)

const submitting = ref(false)
const submitError = ref('')
const submitted = ref(false)

const canSubmit = computed(
  () =>
    selectedType.value &&
    selectedSeverity.value &&
    latitude.value != null &&
    longitude.value != null
)

function requestLocation() {
  if (!navigator.geolocation) {
    locationError.value =
      'Geolocation is not supported on this device. Tap the map to set your position.'
    return
  }

  locatingUser.value = true
  locationError.value = ''

  navigator.geolocation.getCurrentPosition(
    (position) => {
      latitude.value = position.coords.latitude
      longitude.value = position.coords.longitude
      accuracyMeters.value = Math.round(position.coords.accuracy)
      locatingUser.value = false
    },
    () => {
      locationError.value =
        "We couldn't get your location. Tap the map to set your position manually."
      locatingUser.value = false
    },
    { enableHighAccuracy: true, timeout: 10000 }
  )
}

function onPhotoChange(event) {
  const file = event.target.files?.[0]
  if (!file) return

  if (photoPreviewUrl.value) URL.revokeObjectURL(photoPreviewUrl.value)
  photoFile.value = file
  photoPreviewUrl.value = URL.createObjectURL(file)
}

function clearPhoto(event) {
  event.preventDefault()
  if (photoPreviewUrl.value) URL.revokeObjectURL(photoPreviewUrl.value)
  photoFile.value = null
  photoPreviewUrl.value = null
}

async function submitReport() {
  if (!canSubmit.value || submitting.value) return

  submitting.value = true
  submitError.value = ''

  const formData = new FormData()
  formData.append('type', selectedType.value)
  formData.append('severity', selectedSeverity.value)
  formData.append('latitude', String(latitude.value))
  formData.append('longitude', String(longitude.value))
  if (description.value.trim()) formData.append('description', description.value.trim())
  if (photoFile.value) formData.append('photo', photoFile.value)

  try {
    await api.post('/reports', formData)
    submitted.value = true
  } catch (err) {
    submitError.value =
      err.response?.data?.error ?? 'Could not submit the report. Please try again.'
  } finally {
    submitting.value = false
  }
}

function close() {
  emit('close')
}

onMounted(requestLocation)

onBeforeUnmount(() => {
  if (photoPreviewUrl.value) URL.revokeObjectURL(photoPreviewUrl.value)
})
</script>

<template>
  <Teleport to="body">
    <div class="send-report-backdrop" @click.self="close">
      <BaseCard v-if="submitted" class="send-report-dialog send-report-dialog--confirmation">
        <svg
          class="send-report__confirmation-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M8 12l3 3 5-6" />
        </svg>
        <h1>Report sent</h1>
        <p>Thanks for helping keep the trails safe. An admin will review your report.</p>
        <BaseButton variant="primary" @click="close">Back to map</BaseButton>
      </BaseCard>

      <BaseCard v-else class="send-report-dialog">
        <div class="send-report-dialog__header">
          <h1>New trail incident report</h1>
          <button type="button" class="send-report__close" title="Close" @click="close">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div class="send-report-dialog__body">
          <div class="send-report-dialog__column">
            <section class="send-report__section">
              <h2>1. What are you reporting?</h2>
              <div class="send-report__type-grid">
                <button
                  v-for="option in REPORT_TYPE_OPTIONS"
                  :key="option.value"
                  type="button"
                  class="send-report__type-option"
                  :class="{ 'send-report__type-option--selected': selectedType === option.value }"
                  @click="selectedType = option.value"
                >
                  <span class="send-report__type-icon" v-html="option.icon"></span>
                  <span>{{ option.label }}</span>
                </button>
              </div>
            </section>

            <section class="send-report__section">
              <h2>2. Severity level</h2>
              <div class="send-report__severity-group">
                <button
                  v-for="option in REPORT_SEVERITY_OPTIONS"
                  :key="option.value"
                  type="button"
                  class="send-report__severity-option"
                  :class="{
                    'send-report__severity-option--selected': selectedSeverity === option.value
                  }"
                  :style="{ '--severity-color': option.color }"
                  @click="selectedSeverity = option.value"
                >
                  {{ option.label }}
                </button>
              </div>
            </section>
          </div>

          <div class="send-report-dialog__column">
            <section class="send-report__section">
              <h2>3. Incident location</h2>
              <LocationPicker
                v-model:latitude="latitude"
                v-model:longitude="longitude"
                :accuracy-meters="accuracyMeters"
              />
              <BaseButton
                variant="secondary"
                class="send-report__gps-button"
                :disabled="locatingUser"
                @click="requestLocation"
              >
                {{ locatingUser ? 'Locating…' : 'Use current GPS coordinates' }}
              </BaseButton>
              <p v-if="accuracyMeters != null" class="send-report__hint">
                Accuracy: ~{{ accuracyMeters }} m. Drag the pin or tap the map if it's not quite
                right.
              </p>
              <p v-if="locationError" class="send-report__hint send-report__hint--warning">
                {{ locationError }}
              </p>
            </section>

            <section class="send-report__section">
              <h2>4. Attach evidence photo</h2>
              <label class="send-report__photo">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  hidden
                  @change="onPhotoChange"
                />
                <img v-if="photoPreviewUrl" :src="photoPreviewUrl" alt="Report photo preview" />
                <span v-else>Take a photo</span>
              </label>
              <button
                v-if="photoPreviewUrl"
                type="button"
                class="send-report__photo-remove"
                @click="clearPhoto"
              >
                Remove photo
              </button>
            </section>
          </div>
        </div>

        <details class="send-report__details">
          <summary>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
            Detailed observations <span class="send-report__optional">(optional)</span>
          </summary>
          <textarea
            v-model="description"
            maxlength="1000"
            rows="3"
            placeholder="Anything else worth mentioning?"
          />
        </details>

        <p v-if="submitError" class="send-report__error">{{ submitError }}</p>

        <div class="send-report-dialog__footer">
          <BaseButton variant="secondary" type="button" @click="close">Cancel</BaseButton>
          <BaseButton
            variant="primary"
            type="button"
            :disabled="!canSubmit || submitting"
            @click="submitReport"
          >
            {{ submitting ? 'Sending…' : 'Submit incident report' }}
          </BaseButton>
        </div>
      </BaseCard>
    </div>
  </Teleport>
</template>

<style scoped>
.send-report-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: rgba(20, 30, 25, 0.45);
  backdrop-filter: blur(2px);
}

.send-report-dialog {
  width: 100%;
  max-width: 680px;
  max-height: calc(100vh - 3rem);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.25);
}

.send-report-dialog__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.send-report-dialog__header h1 {
  font-family: var(--font-heading);
  font-weight: 400;
  font-size: 1.4rem;
  margin: 0;
}

.send-report-dialog__body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
}

.send-report-dialog__column {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.send-report-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.send-report__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
}

.send-report__close:hover {
  background: var(--color-background);
  color: var(--color-primary);
}

.send-report__close svg {
  width: 20px;
  height: 20px;
}

.send-report__section h2 {
  font-size: 0.9rem;
  font-weight: 600;
  margin: 0 0 0.4rem;
}

.send-report__optional {
  font-weight: 400;
  color: var(--color-text-muted);
}

.send-report__hint {
  margin: 0.4rem 0 0;
  font-size: 0.78rem;
  color: var(--color-text-muted);
}

.send-report__hint--warning {
  color: #f97316;
}

.send-report__gps-button {
  width: 100%;
  margin-top: 0.5rem;
}

.send-report__type-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
}

.send-report__type-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
  padding: 0.6rem 0.4rem;
  border: 2px solid rgba(26, 62, 47, 0.1);
  border-radius: var(--radius-card);
  background: var(--color-surface);
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: 0.75rem;
  cursor: pointer;
}

.send-report__type-option--selected {
  border-color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 10%, white);
}

.send-report__type-icon {
  display: inline-flex;
  color: var(--color-primary);
}

.send-report__type-icon :deep(svg) {
  width: 24px;
  height: 24px;
}

.send-report__severity-group {
  display: flex;
  gap: 0.5rem;
}

.send-report__severity-option {
  flex: 1;
  min-height: 40px;
  border: 2px solid var(--severity-color);
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  color: var(--severity-color);
  font-family: var(--font-body);
  font-weight: 600;
  cursor: pointer;
}

.send-report__severity-option--selected {
  background: var(--severity-color);
  color: var(--color-surface);
}

.send-report__photo {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 88px;
  border: 2px dashed rgba(26, 62, 47, 0.2);
  border-radius: var(--radius-card);
  color: var(--color-text-muted);
  font-size: 0.85rem;
  cursor: pointer;
  overflow: hidden;
}

.send-report__photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.send-report__photo-remove {
  margin-top: 0.4rem;
  border: none;
  background: none;
  color: var(--color-primary);
  font-family: var(--font-body);
  font-size: 0.85rem;
  cursor: pointer;
  padding: 0;
}

.send-report__details {
  border-top: 1px solid rgba(26, 62, 47, 0.1);
  padding-top: 0.75rem;
}

.send-report__details summary {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  list-style: none;
}

.send-report__details summary::-webkit-details-marker {
  display: none;
}

.send-report__details summary svg {
  width: 16px;
  height: 16px;
  transition: transform 0.15s ease;
}

.send-report__details[open] summary svg {
  transform: rotate(180deg);
}

.send-report__details textarea {
  width: 100%;
  margin-top: 0.6rem;
  border: 2px solid rgba(26, 62, 47, 0.1);
  border-radius: var(--radius-card);
  padding: 0.6rem;
  font-family: var(--font-body);
  font-size: 0.9rem;
  resize: vertical;
  box-sizing: border-box;
}

.send-report__error {
  color: #ef4444;
  font-size: 0.9rem;
  margin: 0;
}

.send-report-dialog--confirmation {
  align-items: center;
  text-align: center;
  padding: 2rem 1.5rem;
  max-width: 420px;
}

.send-report__confirmation-icon {
  width: 56px;
  height: 56px;
  color: var(--color-status-open, #10b981);
}

.send-report-dialog--confirmation h1 {
  font-family: var(--font-heading);
  font-weight: 400;
  margin: 0;
}

.send-report-dialog--confirmation p {
  margin: 0;
  color: var(--color-text-muted);
}

@media (max-width: 720px) {
  .send-report-backdrop {
    padding: 0;
  }

  .send-report-dialog {
    max-width: none;
    max-height: none;
    height: 100%;
    border-radius: 0;
  }

  .send-report-dialog__body {
    grid-template-columns: 1fr;
  }

  .send-report-dialog__footer {
    flex-direction: column-reverse;
  }
}
</style>
