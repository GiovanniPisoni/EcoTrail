function bboxToPolygon(west, south, east, north) {
  return {
    type: 'Polygon',
    coordinates: [
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south]
      ]
    ]
  }
}

export function parseBbox(bboxParam) {
  if (!bboxParam) {
    return { error: 'bbox query parameter is required (format: west,south,east,north)' }
  }

  const parts = bboxParam.split(',').map(Number)
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
    return { error: 'bbox must be 4 comma-separated numbers: west,south,east,north' }
  }

  const [west, south, east, north] = parts
  if (west >= east || south >= north) {
    return { error: 'invalid bbox: west must be less than east, south less than north' }
  }

  return { polygon: bboxToPolygon(west, south, east, north) }
}
