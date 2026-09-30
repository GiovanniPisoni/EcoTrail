import { describe, it, expect } from 'vitest'
import { MAX_DESCRIPTION_LENGTH, validateReportInput } from '../src/services/validateReportInput.js'

const validBody = {
  type: 'fallen_tree',
  severity: 'medium',
  description: 'Big pine across the path',
  latitude: 46.18,
  longitude: 10.9
}

describe('validateReportInput', () => {
  it('accepts a valid body', () => {
    expect(validateReportInput(validBody)).toEqual({ value: validBody })
  })

  it('accepts numeric strings for the coordinates (multipart/form-data)', () => {
    const { value, errors } = validateReportInput({
      ...validBody,
      latitude: '46.18',
      longitude: ' 10.9 '
    })

    expect(errors).toBeUndefined()
    expect(value.latitude).toBe(46.18)
    expect(value.longitude).toBe(10.9)
  })

  describe('description', () => {
    it.each([undefined, null, '', '   '])('is optional (%j)', (description) => {
      const { value, errors } = validateReportInput({ ...validBody, description })

      expect(errors).toBeUndefined()
      expect(value.description).toBeUndefined()
    })

    it('is trimmed', () => {
      const { value } = validateReportInput({ ...validBody, description: '  Rockfall  ' })
      expect(value.description).toBe('Rockfall')
    })

    it('accepts exactly the maximum length and rejects one character more', () => {
      const atLimit = 'a'.repeat(MAX_DESCRIPTION_LENGTH)

      expect(validateReportInput({ ...validBody, description: atLimit }).errors).toBeUndefined()
      expect(
        validateReportInput({ ...validBody, description: atLimit + 'a' }).errors
      ).toHaveProperty('description')
    })

    it('rejects a value that is not a string', () => {
      expect(validateReportInput({ ...validBody, description: 123 }).errors).toHaveProperty(
        'description'
      )
    })
  })

  describe('type and severity', () => {
    it.each(['tree', '', null, undefined, ['fallen_tree']])('rejects the type %j', (type) => {
      expect(validateReportInput({ ...validBody, type }).errors).toHaveProperty('type')
    })

    it.each(['critical', '', null, undefined])('rejects the severity %j', (severity) => {
      expect(validateReportInput({ ...validBody, severity }).errors).toHaveProperty('severity')
    })

    it('lists the allowed values in the message', () => {
      const { errors } = validateReportInput({ ...validBody, type: 'tree', severity: 'critical' })

      expect(errors.type).toContain('fallen_tree')
      expect(errors.severity).toContain('low, medium, high')
    })
  })

  describe('coordinates', () => {
    it.each([91, -91, 'abc', '', null, undefined, true, 'Infinity'])(
      'rejects the latitude %j',
      (latitude) => {
        expect(validateReportInput({ ...validBody, latitude }).errors).toHaveProperty('latitude')
      }
    )

    it.each([181, -181, 'abc', '', null, undefined, false, 'Infinity'])(
      'rejects the longitude %j',
      (longitude) => {
        expect(validateReportInput({ ...validBody, longitude }).errors).toHaveProperty('longitude')
      }
    )

    it('accepts the extreme valid values', () => {
      expect(
        validateReportInput({ ...validBody, latitude: 90, longitude: -180 }).errors
      ).toBeUndefined()
      expect(
        validateReportInput({ ...validBody, latitude: -90, longitude: 180 }).errors
      ).toBeUndefined()
    })
  })

  it('reports every invalid field at once', () => {
    const { errors, value } = validateReportInput({
      type: 'x',
      severity: 'y',
      latitude: 'a',
      longitude: 'b'
    })

    expect(value).toBeUndefined()
    expect(Object.keys(errors).sort()).toEqual(['latitude', 'longitude', 'severity', 'type'])
  })

  it.each([undefined, null, {}])('rejects a missing body (%j)', (body) => {
    expect(Object.keys(validateReportInput(body).errors).sort()).toEqual([
      'latitude',
      'longitude',
      'severity',
      'type'
    ])
  })
})
