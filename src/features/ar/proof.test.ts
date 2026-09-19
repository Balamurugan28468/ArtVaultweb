import { describe, expect, it } from 'vitest'
import { parseProof } from './proof'
const version = 'a'.repeat(64)
const valid = { artworkId: 'a1', imageId: 'front.jpg', widthMm: 400, heightMm: 200, includesFrame: false, version, modelUrl: `/__ar-proof/model/${version}.glb` }
describe('operator manifest contract', () => {
  it('accepts explicit measurements for the selected artwork only', () => {
    expect(parseProof(valid, 'a1')).toEqual(valid)
    expect(parseProof(valid, 'other')).toBeNull()
  })
  it.each([{ widthMm: undefined }, { heightMm: 0 }, { widthMm: 1.5 }, { modelUrl: 'https://example.com/model.glb' }, { version: '../secret' }, { includesFrame: null }])('rejects malformed or unsafe metadata: %j', (change) => {
    expect(parseProof({ ...valid, ...change }, 'a1')).toBeNull()
  })
})
