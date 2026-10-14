<script setup>
import { onBeforeUnmount, ref } from 'vue'
import L from 'leaflet'

const props = defineProps({
  map: {
    type: Object,
    default: null
  }
})

const SEARCH_URL = 'https://nominatim.openstreetmap.org/search'
const MAX_RESULTS = 5
const PLACE_ZOOM = 13

const query = ref('')
const results = ref([])
const message = ref('')
const loading = ref(false)

let requestId = 0
let marker = null

function shortName(place) {
  return place.display_name.split(',').slice(0, 3).join(',').trim()
}

async function search() {
  const text = query.value.trim()
  if (!text) return

  const current = ++requestId
  loading.value = true
  message.value = ''
  results.value = []

  const params = new URLSearchParams({
    format: 'jsonv2',
    limit: String(MAX_RESULTS),
    countrycodes: 'it',
    'accept-language': 'en',
    q: text
  })

  try {
    const response = await fetch(`${SEARCH_URL}?${params}`)
    if (!response.ok) throw new Error(`Search failed with status ${response.status}`)
    const places = await response.json()
    if (current !== requestId) return

    results.value = places
    if (places.length === 0) message.value = 'No place found. Try another name.'
    if (places.length === 1) goTo(places[0])
  } catch (err) {
    if (current !== requestId) return
    console.error('Failed to search the place:', err)
    message.value = 'Search is not available right now. Check your connection.'
  } finally {
    if (current === requestId) loading.value = false
  }
}

function goTo(place) {
  if (!props.map) return

  const latitude = Number(place.lat)
  const longitude = Number(place.lon)
  const [south, north, west, east] = (place.boundingbox ?? []).map(Number)

  if (Number.isFinite(south) && Number.isFinite(east) && south !== north) {
    props.map.fitBounds(
      [
        [south, west],
        [north, east]
      ],
      { maxZoom: 14 }
    )
  } else {
    props.map.setView([latitude, longitude], PLACE_ZOOM)
  }

  marker?.remove()
  marker = L.circleMarker([latitude, longitude], {
    radius: 9,
    color: '#ffffff',
    weight: 3,
    fillColor: '#1a3e2f',
    fillOpacity: 1,
    interactive: false
  }).addTo(props.map)

  query.value = shortName(place)
  results.value = []
  message.value = ''
}

function clear() {
  requestId += 1
  query.value = ''
  results.value = []
  message.value = ''
  loading.value = false
  marker?.remove()
  marker = null
}

onBeforeUnmount(() => marker?.remove())
</script>

<template>
  <div class="map-search" role="search">
    <form class="map-search__form" @submit.prevent="search">
      <svg
        class="map-search__icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        v-model="query"
        type="search"
        class="map-search__input"
        placeholder="Search a place"
        aria-label="Search a place"
        autocomplete="off"
        enterkeyhint="search"
      />
      <button
        v-if="query"
        type="button"
        class="map-search__clear"
        aria-label="Clear the search"
        @click="clear"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </form>

    <ul v-if="results.length > 1" class="map-search__results">
      <li v-for="place in results" :key="place.place_id">
        <button type="button" class="map-search__result" @click="goTo(place)">
          {{ shortName(place) }}
          <span class="map-search__result-detail">{{ place.display_name }}</span>
        </button>
      </li>
    </ul>
    <p v-else-if="loading" class="map-search__message" role="status">Searching…</p>
    <p v-else-if="message" class="map-search__message" role="status">{{ message }}</p>
  </div>
</template>

<style scoped>
.map-search {
  position: absolute;
  top: 10px;
  left: 50%;
  z-index: 1000;
  width: min(380px, 50%);
  transform: translateX(-50%);
}

.map-search__form {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  height: 44px;
  padding: 0 0.5rem 0 0.9rem;
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  box-shadow: 0 1px 4px rgba(26, 62, 47, 0.2);
}

.map-search__icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  color: var(--color-text-muted);
}

.map-search__input {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: 0.95rem;
}

.map-search__input:focus {
  outline: none;
}

.map-search__input::-webkit-search-cancel-button {
  display: none;
}

.map-search__clear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  padding: 0;
  border: none;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
}

.map-search__clear svg {
  width: 18px;
  height: 18px;
}

.map-search__results,
.map-search__message {
  margin: 0.4rem 0 0;
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: 0 1px 4px rgba(26, 62, 47, 0.2);
}

.map-search__results {
  padding: 0.25rem;
  list-style: none;
}

.map-search__message {
  padding: 0.6rem 0.9rem;
  font-size: 0.9rem;
  color: var(--color-text-muted);
}

.map-search__result {
  display: block;
  width: 100%;
  padding: 0.6rem 0.75rem;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: 0.95rem;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}

.map-search__result:hover {
  background: var(--color-background);
}

.map-search__result-detail {
  display: block;
  margin-top: 0.1rem;
  font-size: 0.78rem;
  font-weight: 400;
  color: var(--color-text-muted);
}

@media (max-width: 640px) {
  .map-search {
    left: 10px;
    right: 10px;
    width: auto;
    transform: none;
  }
}
</style>
