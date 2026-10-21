<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import L from 'leaflet'
import api from '@/api/client.js'
import { getTrailStatusLabel } from '@/config/trailStatus.js'

const props = defineProps({
  map: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['trail-picked'])

const SEARCH_URL = 'https://nominatim.openstreetmap.org/search'
const SUGGEST_URL = 'https://photon.komoot.io/api/'
const MAX_RESULTS = 5
const MAX_PLACE_SUGGESTIONS = 8
const MAX_PER_GROUP_WHEN_ALL = 3
const SUGGESTION_POOL = 12
const ITALY_BBOX = '6.6,35.4,18.8,47.2'
const SUGGESTED_PLACE_KEYS = new Set(['place', 'natural', 'boundary'])
const PLACE_ZOOM = 13
const SUGGESTION_DELAY_MS = 250
const MIN_SUGGESTION_LENGTH = 2
const MIN_PLACE_SUGGESTION_LENGTH = 3

const SCOPES = [
  { value: 'all', label: 'All', empty: 'No trail or place found. Try another name.' },
  { value: 'trails', label: 'Trails', empty: 'No trail found. Try another name.' },
  { value: 'places', label: 'Places', empty: 'No place found. Try another name.' }
]

const query = ref('')
const scope = ref('all')
const scopesOpen = ref(false)
const input = ref(null)
const trails = ref([])
const results = ref([])
const message = ref('')
const loading = ref(false)

const isOpen = computed(
  () =>
    scopesOpen.value ||
    loading.value ||
    Boolean(message.value) ||
    trails.value.length > 0 ||
    results.value.length > 0
)

const searchTrails = computed(() => scope.value !== 'places')
const searchPlaces = computed(() => scope.value !== 'trails')
const shownTrails = computed(() =>
  scope.value === 'all' ? trails.value.slice(0, MAX_PER_GROUP_WHEN_ALL) : trails.value
)
const shownPlaces = computed(() =>
  scope.value === 'all' ? results.value.slice(0, MAX_PER_GROUP_WHEN_ALL) : results.value
)

let requestId = 0
let suggestionTimer = null
let marker = null

function shortName(place) {
  return place.display_name.split(',').slice(0, 3).join(',').trim()
}

function toBounds(south, north, west, east) {
  const values = [south, north, west, east]
  if (!values.every(Number.isFinite) || south === north) return null
  return [
    [south, west],
    [north, east]
  ]
}

function fromSearch(place) {
  const [south, north, west, east] = (place.boundingbox ?? []).map(Number)
  return {
    key: `search-${place.place_id}`,
    name: shortName(place),
    detail: place.display_name,
    lat: Number(place.lat),
    lon: Number(place.lon),
    bounds: toBounds(south, north, west, east)
  }
}

function fromSuggestion(feature) {
  const { name, osm_id: osmId, osm_type: osmType, county, city, state, extent } = feature.properties
  const [lon, lat] = feature.geometry.coordinates
  const [west, north, east, south] = extent ?? []
  return {
    key: `suggestion-${osmType}-${osmId}`,
    name,
    detail: [county ?? city, state].filter(Boolean).join(', '),
    lat,
    lon,
    bounds: toBounds(south, north, west, east)
  }
}

async function findTrails(text) {
  try {
    const { data } = await api.get('/trails/search', { params: { q: text } })
    return data
  } catch (err) {
    console.error('Failed to search the trails:', err)
    return []
  }
}

async function findPlaces(text) {
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
    return await response.json()
  } catch (err) {
    console.error('Failed to search the place:', err)
    return null
  }
}

async function findSuggestedPlaces(text) {
  const params = new URLSearchParams({
    q: text,
    limit: String(SUGGESTION_POOL),
    bbox: ITALY_BBOX
  })
  const center = props.map?.getCenter()
  if (center) {
    params.set('lat', String(center.lat))
    params.set('lon', String(center.lng))
  }

  try {
    const response = await fetch(`${SUGGEST_URL}?${params}`)
    if (!response.ok) throw new Error(`Suggestions failed with status ${response.status}`)
    const { features } = await response.json()

    const seen = new Set()
    return features
      .filter(
        ({ properties }) =>
          properties.name &&
          properties.countrycode === 'IT' &&
          SUGGESTED_PLACE_KEYS.has(properties.osm_key)
      )
      .map(fromSuggestion)
      .filter((place) => {
        const id = `${place.name}|${place.detail}`
        if (seen.has(id)) return false
        seen.add(id)
        return true
      })
      .slice(0, MAX_PLACE_SUGGESTIONS)
  } catch (err) {
    console.error('Failed to suggest the places:', err)
    return []
  }
}

function suggest() {
  clearTimeout(suggestionTimer)
  message.value = ''

  const text = query.value.trim()
  if (text.length < MIN_SUGGESTION_LENGTH) {
    requestId += 1
    trails.value = []
    results.value = []
    scopesOpen.value = false
    return
  }

  scopesOpen.value = true

  suggestionTimer = setTimeout(() => {
    const current = ++requestId

    if (searchTrails.value) {
      findTrails(text).then((found) => {
        if (current === requestId) trails.value = found
      })
    } else {
      trails.value = []
    }

    if (!searchPlaces.value || text.length < MIN_PLACE_SUGGESTION_LENGTH) {
      results.value = []
      return
    }

    findSuggestedPlaces(text).then((found) => {
      if (current === requestId) results.value = found
    })
  }, SUGGESTION_DELAY_MS)
}

async function search() {
  const text = query.value.trim()
  if (!text) return

  input.value?.blur()
  clearTimeout(suggestionTimer)

  const current = ++requestId
  loading.value = true
  scopesOpen.value = true
  message.value = ''
  results.value = []

  const [foundTrails, places] = await Promise.all([
    searchTrails.value ? findTrails(text) : [],
    searchPlaces.value ? findPlaces(text) : []
  ])
  if (current !== requestId) return

  loading.value = false
  trails.value = foundTrails
  results.value = (places ?? []).map(fromSearch)

  if (foundTrails.length === 0 && places === null) {
    message.value = 'Search is not available right now. Check your connection.'
  } else if (foundTrails.length === 0 && places.length === 0) {
    message.value = SCOPES.find((option) => option.value === scope.value).empty
  } else if (foundTrails.length === 1 && results.value.length === 0) {
    pickTrail(foundTrails[0])
  } else if (foundTrails.length === 0 && places.length === 1) {
    goTo(results.value[0])
  }
}

function pickTrail(trail) {
  if (!props.map) return

  const [west, south, east, north] = trail.bounds
  props.map.fitBounds(
    [
      [south, west],
      [north, east]
    ],
    { maxZoom: 16, padding: [40, 40] }
  )

  marker?.remove()
  marker = null
  scopesOpen.value = false
  query.value = trail.name
  trails.value = []
  results.value = []
  message.value = ''
  input.value?.blur()
  emit('trail-picked', String(trail.id))
}

function goTo(place) {
  if (!props.map) return

  if (place.bounds) props.map.fitBounds(place.bounds, { maxZoom: 14 })
  else props.map.setView([place.lat, place.lon], PLACE_ZOOM)

  marker?.remove()
  marker = L.circleMarker([place.lat, place.lon], {
    radius: 9,
    color: '#ffffff',
    weight: 3,
    fillColor: '#1a3e2f',
    fillOpacity: 1,
    interactive: false
  }).addTo(props.map)

  scopesOpen.value = false
  query.value = place.name
  trails.value = []
  results.value = []
  message.value = ''
  input.value?.blur()
}

function clear() {
  requestId += 1
  clearTimeout(suggestionTimer)
  query.value = ''
  scopesOpen.value = false
  trails.value = []
  results.value = []
  message.value = ''
  loading.value = false
  marker?.remove()
  marker = null
}

watch(scope, () => {
  if (query.value.trim().length >= MIN_SUGGESTION_LENGTH) suggest()
})

onBeforeUnmount(() => {
  clearTimeout(suggestionTimer)
  marker?.remove()
})
</script>

<template>
  <div class="map-search" :class="{ 'map-search--open': isOpen }" role="search">
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
        ref="input"
        v-model="query"
        type="search"
        class="map-search__input"
        placeholder="Search a trail or a place"
        aria-label="Search a trail or a place"
        autocomplete="off"
        enterkeyhint="search"
        @input="suggest"
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

    <div v-if="scopesOpen" class="map-search__scopes" role="group" aria-label="What to search">
      <button
        v-for="option in SCOPES"
        :key="option.value"
        type="button"
        class="map-search__scope"
        :class="{ 'map-search__scope--selected': scope === option.value }"
        :aria-pressed="scope === option.value"
        @click="scope = option.value"
      >
        {{ option.label }}
      </button>
    </div>

    <ul v-if="shownTrails.length > 0 || shownPlaces.length > 0" class="map-search__results">
      <li v-if="scope === 'all' && shownTrails.length > 0" class="map-search__heading">Trails</li>
      <li v-for="trail in shownTrails" :key="trail.id">
        <button
          type="button"
          class="map-search__result map-search__result--trail"
          @click="pickTrail(trail)"
        >
          <svg
            class="map-search__result-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M3 20 9 8l4 6 3-5 5 11z" />
          </svg>
          <span class="map-search__result-text">
            {{ trail.name }}
            <span class="map-search__result-detail">{{ getTrailStatusLabel(trail.status) }}</span>
          </span>
        </button>
      </li>
      <li
        v-if="scope === 'all' && shownTrails.length > 0 && shownPlaces.length > 0"
        class="map-search__heading"
      >
        Places
      </li>
      <li v-for="place in shownPlaces" :key="place.key">
        <button
          type="button"
          class="map-search__result map-search__result--place"
          @click="goTo(place)"
        >
          <svg
            class="map-search__result-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M12 22s7-7.58 7-13a7 7 0 1 0-14 0c0 5.42 7 13 7 13z" />
            <circle cx="12" cy="9" r="2.5" />
          </svg>
          <span class="map-search__result-text">
            {{ place.name }}
            <span v-if="place.detail" class="map-search__result-detail">{{ place.detail }}</span>
          </span>
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
  display: flex;
  flex-direction: column;
  width: min(380px, 50%);
  max-height: calc(100% - 20px);
  transform: translateX(-50%);
}

.map-search--open {
  overflow: hidden;
  border-radius: 22px;
  background: var(--color-surface);
  box-shadow: 0 1px 4px rgba(26, 62, 47, 0.2);
}

.map-search--open .map-search__form {
  box-shadow: none;
}

.map-search--open .map-search__scopes {
  margin: 0 0.6rem 0.4rem;
}

.map-search--open .map-search__scope {
  box-shadow: none;
}

.map-search--open .map-search__results,
.map-search--open .map-search__message {
  margin: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.map-search__form {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  height: 44px;
  padding: 0 0.5rem 0 0.9rem;
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  box-shadow: 0 1px 4px rgba(26, 62, 47, 0.2);
}

.map-search__scopes {
  flex-shrink: 0;
  display: flex;
  gap: 0.4rem;
  margin-top: 0.4rem;
}

.map-search__scope {
  padding: 0.3rem 0.8rem;
  border: 1px solid rgba(26, 62, 47, 0.15);
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  box-shadow: 0 1px 4px rgba(26, 62, 47, 0.2);
  color: var(--color-text-muted);
  font-family: var(--font-body);
  font-size: 0.8rem;
  cursor: pointer;
}

.map-search__scope--selected {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: #fff;
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
  min-height: 0;
  padding: 0.25rem;
  overflow-y: auto;
  overscroll-behavior: contain;
  list-style: none;
}

.map-search__heading {
  padding: 0.4rem 0.75rem 0.1rem;
  color: var(--color-text-muted);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.map-search__message {
  padding: 0.6rem 0.9rem;
  font-size: 0.9rem;
  color: var(--color-text-muted);
}

.map-search__result {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
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

.map-search__result-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  margin-top: 0.1rem;
  color: var(--color-primary);
}

.map-search__result-text {
  min-width: 0;
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
