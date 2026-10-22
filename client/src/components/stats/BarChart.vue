<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { BarController, BarElement, CategoryScale, Chart, LinearScale, Tooltip } from 'chart.js'

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip)

const props = defineProps({
  labels: { type: Array, required: true },
  values: { type: Array, required: true },
  datasetLabel: { type: String, default: 'Hikers' },
  color: { type: String, default: '#1a3e2f' },
  ariaLabel: { type: String, default: 'Bar chart' }
})

const canvas = ref(null)
let chart = null

function buildOptions() {
  const valueAxis = { beginAtZero: true, ticks: { precision: 0 } }
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { y: valueAxis }
  }
}

onMounted(() => {
  chart = new Chart(canvas.value, {
    type: 'bar',
    data: {
      labels: props.labels,
      datasets: [
        {
          label: props.datasetLabel,
          data: props.values,
          backgroundColor: props.color,
          borderRadius: 4
        }
      ]
    },
    options: buildOptions()
  })
})

watch(
  () => [props.labels, props.values],
  () => {
    if (!chart) return
    chart.data.labels = props.labels
    chart.data.datasets[0].data = props.values
    chart.update()
  }
)

onBeforeUnmount(() => {
  chart?.destroy()
  chart = null
})
</script>

<template>
  <div class="bar-chart">
    <canvas ref="canvas" role="img" :aria-label="ariaLabel" />
  </div>
</template>

<style scoped>
.bar-chart {
  position: relative;
  width: 100%;
  height: 100%;
}
</style>
