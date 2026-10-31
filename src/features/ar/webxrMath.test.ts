import {
  describe,
  expect,
  it,
} from 'vitest'
import {
  MAX_AR_SCALE,
  MIN_AR_SCALE,
  clampArScale,
  formatArCentimetres,
  scaleDisplaySize,
} from './webxrMath'

describe(
  'ArtVault WebXR sizing',
  () => {
    it(
      'keeps AR scaling inside the supported user range',
      () => {
        expect(
          clampArScale(
            0.1,
          ),
        ).toBe(
          MIN_AR_SCALE,
        )

        expect(
          clampArScale(
            1.25,
          ),
        ).toBe(
          1.25,
        )

        expect(
          clampArScale(
            8,
          ),
        ).toBe(
          MAX_AR_SCALE,
        )
      },
    )

    it(
      'calculates live framed display dimensions from the user scale',
      () => {
        const result =
          scaleDisplaySize(
            498.5,
            760,
            1.25,
          )

        expect(
          result.widthMm,
        ).toBeCloseTo(
          623.125,
        )

        expect(
          result.heightMm,
        ).toBeCloseTo(
          950,
        )

        expect(
          result.widthCm,
        ).toBeCloseTo(
          62.3125,
        )

        expect(
          result.heightCm,
        ).toBeCloseTo(
          95,
        )

        expect(
          result.scalePercent,
        ).toBe(
          125,
        )
      },
    )

    it(
      'formats centimetres for the AR HUD',
      () => {
        expect(
          formatArCentimetres(
            49.85,
          ),
        ).toBe(
          '49.9',
        )

        expect(
          formatArCentimetres(
            76,
          ),
        ).toBe(
          '76',
        )
      },
    )
  },
)