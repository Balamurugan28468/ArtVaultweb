import { describe, expect, it } from 'vitest'
import { parseProof } from './proof'
const version = 'a'.repeat(64)
const valid = {
  artworkId: 'a1', imageId: 'front.jpg', sizingMode: 'ESTIMATED_STANDARD_DISPLAY',
  artworkWidthMm: 400, artworkHeightMm: 200, frameMm: 30,
  widthMm: 460, heightMm: 260, includesFrame: true, defaultFrame: 'black',
  frames: Object.fromEntries(['black', 'walnut', 'white', 'gold'].map((style) => [style, {
    label: style[0].toUpperCase() + style.slice(1), version,
    modelUrl: `/__ar-proof/model/a1/${version}.glb`,
  }])),
  version, modelUrl: `/__ar-proof/model/a1/${version}.glb`,
}
describe('operator manifest contract', () => {
  it('accepts estimated framed dimensions for the selected artwork only', () => {
    expect(parseProof(valid, 'a1')).toEqual(valid)
    expect(parseProof(valid, 'other')).toBeNull()
  })
  it.each([{ widthMm: undefined }, { heightMm: 0 }, { widthMm: 1.5 }, { modelUrl: 'https://example.com/model.glb' }, { version: '../secret' }, { includesFrame: null }])('rejects malformed or unsafe metadata: %j', (change) => {
    expect(parseProof({ ...valid, ...change }, 'a1')).toBeNull()
  })
})
