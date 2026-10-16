<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import api from '@/api/client.js'
import { submitReport as sendOrQueueReport } from '@/utils/offline/offlineReports.js'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseCard from '@/components/base/BaseCard.vue'
import LocationPicker from '@/components/reports/LocationPicker.vue'
import { REPORT_SEVERITY_OPTIONS, REPORT_TYPE_OPTIONS } from '@/config/reportOptions.js'

const props = defineProps({
  trailId: {
    type: String,
    default: null
  }
})

const emit = defineEmits(['close'])

const trailName = ref('')
const focusBounds = ref(null)

async function loadReportedTrail() {
  try {
    const { data } = await api.get(`/trails/${props.trailId}`)
    const points = data.geometry.coordinates
    const longitudes = points.map(([longitude]) => longitude)
    const latitudes = points.map(([, latitude]) => latitude)
    trailName.value = data.properties.name
    focusBounds.value = [
      [Math.min(...latitudes), Math.min(...longitudes)],
      [Math.max(...latitudes), Math.max(...longitudes)]
    ]
  } catch (err) {
    console.error('Failed to load the trail to report on:', err)
  }
}

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
const queuedForLater = ref(false)

const attempted = ref(false)

const missing = computed(() => {
  const fields = []
  if (!selectedType.value) fields.push({ id: 'type', label: 'what you are reporting' })
  if (!selectedSeverity.value) fields.push({ id: 'severity', label: 'the severity level' })
  if (latitude.value == null || longitude.value == null) {
    fields.push({ id: 'location', label: 'the location on the map' })
  }
  return fields
})

const missingText = computed(() => missing.value.map((field) => field.label).join(', '))

function isMissing(id) {
  return attempted.value && missing.value.some((field) => field.id === id)
}

const hasLocation = computed(() => latitude.value != null && longitude.value != null)

async function showFirstMissing() {
  await nextTick()
  document
    .querySelector('.send-report-dialog [data-missing="true"]')
    ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

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
  if (submitting.value) return

  if (missing.value.length > 0) {
    attempted.value = true
    showFirstMissing()
    return
  }

  submitting.value = true
  submitError.value = ''

  try {
    const result = await sendOrQueueReport(
      {
        type: selectedType.value,
        severity: selectedSeverity.value,
        latitude: latitude.value,
        longitude: longitude.value,
        description: description.value.trim()
      },
      photoFile.value
    )
    queuedForLater.value = result.queued
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

onMounted(() => {
  if (props.trailId) loadReportedTrail()
  else requestLocation()
})

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
        <h1>{{ queuedForLater ? 'Report saved' : 'Report sent' }}</h1>
        <p v-if="queuedForLater">
          You're offline, so the report is saved on this device. It will be sent by itself as soon
          as you're back online.
        </p>
        <p v-else>Thanks for helping keep the trails safe. An admin will review your report.</p>
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
            <section
              class="send-report__section"
              :class="{ 'send-report__section--missing': isMissing('type') }"
              :data-missing="isMissing('type')"
            >
              <h2>
                1. What are you reporting? <span class="send-report__required">required</span>
              </h2>
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

            <section
              class="send-report__section"
              :class="{ 'send-report__section--missing': isMissing('severity') }"
              :data-missing="isMissing('severity')"
            >
              <h2>2. Severity level <span class="send-report__required">required</span></h2>
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
              <ul class="send-report__severity-help">
                <li v-for="option in REPORT_SEVERITY_OPTIONS" :key="option.value">
                  <strong>{{ option.label }}:</strong> {{ option.hint }}
                </li>
              </ul>
            </section>
          </div>

          <div class="send-report-dialog__column">
            <section
              class="send-report__section"
              :class="{ 'send-report__section--missing': isMissing('location') }"
              :data-missing="isMissing('location')"
            >
              <h2>3. Incident location <span class="send-report__required">required</span></h2>
              <p class="send-report__instruction">
                Tap the map where the problem is. Searching only moves the map. Tap a trail to see
                its name.
              </p>
              <p v-if="trailName" class="send-report__trail">
                Reporting on <strong>{{ trailName }}</strong>
              </p>
              <LocationPicker
                v-model:latitude="latitude"
                v-model:longitude="longitude"
                :accuracy-meters="accuracyMeters"
                :focus-bounds="focusBounds"
              />
              <BaseButton
                variant="secondary"
                class="send-report__gps-button"
                :disabled="locatingUser"
                @click="requestLocation"
              >
                {{ locatingUser ? 'Locating…' : 'Use current GPS coordinates' }}
              </BaseButton>
              <p
                class="send-report__location-state"
                :class="{ 'send-report__location-state--set': hasLocation }"
              >
                {{ hasLocation ? 'Position set.' : 'Position not set yet. Tap the map.' }}
              </p>
              <p v-if="accuracyMeters != null" class="send-report__hint">
                Accuracy: ~{{ accuracyMeters }} m. Drag the pin or tap the map if it's not quite
                right.
              </p>
              <p v-if="locationError" class="send-report__hint send-report__hint--warning">
                {{ locationError }}
              </p>
            </section>

            <section class="send-report__section">
              <h2>
                4. Attach evidence photo <span class="send-report__optional">(optional)</span>
              </h2>
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

        <p v-if="attempted && missing.length > 0" class="send-report__error" role="alert">
          Please complete: {{ missingText }}.
        </p>
        <p v-if="submitError" class="send-report__error">{{ submitError }}</p>

        <div class="send-report-dialog__footer">
          <BaseButton variant="secondary" type="button" @click="close">Cancel</BaseButton>
          <BaseButton variant="primary" type="button" :disabled="submitting" @click="submitReport">
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

.send-report__required {
  margin-left: 0.25rem;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.send-report__section--missing {
  padding: 0.5rem;
  margin: -0.5rem;
  border-radius: var(--radius-card);
  outline: 2px solid #ef4444;
  background: color-mix(in srgb, #ef4444 6%, white);
}

.send-report__trail {
  margin: 0 0 0.5rem;
  font-size: 0.9rem;
}

.send-report__severity-help {
  margin: 0.6rem 0 0;
  padding: 0;
  list-style: none;
  font-size: 0.8rem;
  line-height: 1.4;
  color: var(--color-text-muted);
}

.send-report__instruction {
  margin: 0 0 0.5rem;
  font-size: 0.85rem;
  color: var(--color-text-muted);
}

.send-report__location-state {
  margin: 0.5rem 0 0;
  font-size: 0.85rem;
  font-weight: 600;
  color: #ef4444;
}

.send-report__location-state--set {
  color: var(--color-status-open);
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
