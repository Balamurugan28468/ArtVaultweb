import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import type {
  ArProof,
} from '../proof'
import {
  ArtworkArViewer,
} from './ArtworkArViewer'

const {
  release,
  activateAR,
  loadViewer,
} =
  vi.hoisted(() => ({
    release:
      vi.fn(
        (
          element:
            HTMLElement,
        ) =>
          element.remove(),
      ),

    activateAR:
      vi
        .fn()
        .mockResolvedValue(
          undefined,
        ),

    loadViewer:
      vi.fn(),
  }))

vi.mock(
  '../loadViewer',
  () => ({
    loadViewer,
  }),
)

class FakeViewer
  extends HTMLElement {
  loaded = false

  canActivateAR =
    false

  activateAR =
    activateAR
}

if (
  !customElements.get(
    'model-viewer',
  )
) {
  customElements.define(
    'model-viewer',
    FakeViewer,
  )
}

const blackVersion =
  'a'.repeat(64)

const walnutVersion =
  'b'.repeat(64)

const whiteVersion =
  'c'.repeat(64)

const goldVersion =
  'd'.repeat(64)

const proof:
  ArProof = {
    artworkId:
      'a1',

    imageId:
      'front.jpg',

    sizingMode:
      'ESTIMATED_STANDARD_DISPLAY',

    artworkWidthMm:
      1000,

    artworkHeightMm:
      500,

    frameMm:
      30,

    widthMm:
      1060,

    heightMm:
      560,

    includesFrame:
      true,

    defaultFrame:
      'black',

    frames: {
      black: {
        label:
          'Black',

        version:
          blackVersion,

        modelUrl:
          `/__ar-proof/model/a1/${blackVersion}.glb`,
      },

      walnut: {
        label:
          'Walnut',

        version:
          walnutVersion,

        modelUrl:
          `/__ar-proof/model/a1/${walnutVersion}.glb`,
      },

      white: {
        label:
          'White',

        version:
          whiteVersion,

        modelUrl:
          `/__ar-proof/model/a1/${whiteVersion}.glb`,
      },

      gold: {
        label:
          'Gold',

        version:
          goldVersion,

        modelUrl:
          `/__ar-proof/model/a1/${goldVersion}.glb`,
      },
    },

    version:
      blackVersion,

    modelUrl:
      `/__ar-proof/model/a1/${blackVersion}.glb`,
  }

async function setup() {
  const rendered =
    render(
      <ArtworkArViewer
        proof={proof}
        title="Framed artwork"
        poster="/image.jpg"
      />,
    )

  await waitFor(
    () =>
      expect(
        rendered
          .container
          .querySelector(
            'model-viewer',
          ),
      ).not.toBeNull(),
  )

  return {
    ...rendered,

    element:
      rendered
        .container
        .querySelector(
          'model-viewer',
        ) as unknown as
        FakeViewer,
  }
}

beforeEach(() => {
  vi.clearAllMocks()

  loadViewer
    .mockResolvedValue({
      release,
    })

  activateAR
    .mockResolvedValue(
      undefined,
    )
})

describe(
  'real AR viewer wrapper',
  () => {
    it.each(['locking', 'anchored', 'local-lock', 'lost', 'recovered'])(
      'disables every size control and rejects injected slider changes while %s',
      async status => {
        const { element } = await setup()
        act(() => {
          element.dispatchEvent(new CustomEvent('ar-status', { detail: { status: 'object-placed' } }))
          element.dispatchEvent(new CustomEvent('artvault-anchor-state', { detail: { status } }))
        })
        const controls = screen.getAllByRole('slider', { name: 'Artwork size' })
        for (const slider of controls) {
          expect(slider).toBeDisabled()
          fireEvent.input(slider, { target: { value: '200' } })
          fireEvent.change(slider, { target: { value: '200' } })
        }
        for (const name of ['Increase artwork size', 'Decrease artwork size', 'Reset artwork size']) {
          for (const button of screen.getAllByRole('button', { name })) expect(button).toBeDisabled()
        }
        expect(element).toHaveAttribute('scale', '1 1 1')
        act(() => element.dispatchEvent(new CustomEvent('artvault-anchor-state', { detail: { status: 'unlocked' } })))
        fireEvent.click(screen.getAllByRole('button', { name: 'Increase artwork size' })[0])
        expect(element).toHaveAttribute('scale', '1.05 1.05 1.05')
      },
    )

    it('keeps Lock disabled while scanning and resets all locks after session exit', async () => {
      const { element } = await setup()
      act(() => element.dispatchEvent(new CustomEvent('ar-status', { detail: { status: 'session-started' } })))
      expect(screen.getByRole('button', { name: 'Lock artwork position' })).toBeDisabled()
      act(() => {
        element.dispatchEvent(new CustomEvent('ar-status', { detail: { status: 'object-placed' } }))
        element.dispatchEvent(new CustomEvent('artvault-anchor-state', { detail: { status: 'local-lock' } }))
        element.dispatchEvent(new CustomEvent('ar-status', { detail: { status: 'not-presenting' } }))
      })
      expect(screen.getByRole('slider', { name: 'Artwork size' })).toBeEnabled()
      expect(screen.queryByText(/position is locked/)).not.toBeInTheDocument()
    })

    it('prevents duplicate launch requests while browser permission is pending', async () => {
      const { element } = await setup()
      let complete!: () => void
      activateAR.mockReturnValueOnce(new Promise<void>(resolve => { complete = resolve }))
      act(() => { element.loaded = true; element.canActivateAR = true; element.dispatchEvent(new Event('load')) })
      const button = screen.getByRole('button', { name: 'View in your space' })
      fireEvent.click(button); fireEvent.click(button)
      expect(activateAR).toHaveBeenCalledOnce()
      await act(async () => complete())
    })

    it('cleans native overlay handlers when the viewer is replaced', async () => {
      const { element, unmount } = await setup()
      const button = element.querySelector<HTMLButtonElement>('[aria-label="Increase artwork size"]')!
      const remove = vi.spyOn(button, 'removeEventListener')
      unmount()
      expect(remove).toHaveBeenCalledWith('click', expect.any(Function))
    })

    it('shows a specific permission-denied state without exposing the underlying error text', async () => {
      const { element } = await setup()
      activateAR.mockRejectedValueOnce(new DOMException('Internal resource details', 'NotAllowedError'))
      act(() => { element.loaded = true; element.canActivateAR = true; element.dispatchEvent(new Event('load')) })
      fireEvent.click(screen.getByRole('button', { name: 'View in your space' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('Camera/AR permission was denied')
      expect(screen.queryByText('Internal resource details')).not.toBeInTheDocument()
      expect(screen.getByAltText(/artwork image fallback/)).toBeInTheDocument()
    })
    it(
      'shows the estimated framed display dimensions',
      async () => {
        await setup()

        expect(
          screen.getByText(
            /Estimated base display size:/,
          ),
        ).toHaveTextContent(
          '106 × 56 cm',
        )

        expect(
          screen.getByText(
            /Estimated base display size:/,
          ),
        ).toHaveTextContent(
          '3 cm frame',
        )

        expect(
          screen.getByText(
            /estimated visualization size/i,
          ),
        ).toBeInTheDocument()
      },
    )

    it(
      'starts with the default black frame',
      async () => {
        const {
          element,
        } =
          await setup()

        expect(
          screen.getByText(
            /Selected frame:/i,
          ),
        ).toHaveTextContent(
          'Black',
        )

        expect(
          screen.getByRole(
            'button',
            {
              name:
                'Black',
            },
          ),
        ).toHaveAttribute(
          'aria-pressed',
          'true',
        )

        expect(
          element.getAttribute(
            'src',
          ),
        ).toBe(
          proof
            .frames
            .black
            .modelUrl,
        )
      },
    )

    it(
      'switches the actual GLB when another frame is selected',
      async () => {
        const {
          container,
          element,
        } =
          await setup()

        fireEvent.click(
          screen.getByRole(
            'button',
            {
              name:
                'Walnut',
            },
          ),
        )

        await waitFor(
          () =>
            expect(
              container
                .querySelector(
                  'model-viewer',
                ),
            ).not.toBe(
              element,
            ),
        )

        expect(
          release,
        ).toHaveBeenCalledWith(
          element,
        )

        const replacement =
          container
            .querySelector(
              'model-viewer',
            ) as unknown as
            FakeViewer

        expect(
          replacement.getAttribute(
            'src',
          ),
        ).toBe(
          proof
            .frames
            .walnut
            .modelUrl,
        )

        expect(
          screen.getByText(
            /Selected frame:/i,
          ),
        ).toHaveTextContent(
          'Walnut',
        )

        expect(
          screen.getByRole(
            'button',
            {
              name:
                'Walnut',
            },
          ),
        ).toHaveAttribute(
          'aria-pressed',
          'true',
        )
      },
    )

    it(
      'keeps wall placement and uses ArtVault-controlled fixed AR scaling',
      async () => {
        const {
          element,
        } =
          await setup()

        expect(
          screen.getByRole(
            'status',
          ),
        ).toHaveTextContent(
          'Loading',
        )

        expect(
          element.getAttribute(
            'ar-scale',
          ),
        ).toBe(
          'fixed',
        )

        expect(
          element.getAttribute(
            'scale',
          ),
        ).toBe(
          '1 1 1',
        )

        expect(
          element.getAttribute(
            'ar-placement',
          ),
        ).toBe(
          'wall',
        )

        expect(
          element.getAttribute(
            'ar-modes',
          ),
        ).toBe(
          'webxr scene-viewer',
        )

        act(() => {
          element.loaded =
            true

          element.dispatchEvent(
            new Event(
              'load',
            ),
          )
        })

        expect(
          screen.getByRole(
            'status',
          ),
        ).toHaveTextContent(
          '3D preview, not camera placement',
        )
      },
    )

    it(
      'updates exact model scale and live estimated dimensions',
      async () => {
        const {
          element,
        } =
          await setup()

        const sizeRegion =
          screen.getByRole(
            'region',
            {
              name:
                'Artwork size',
            },
          )

        expect(
          sizeRegion,
        ).toHaveTextContent(
          '106 × 56 cm',
        )

        expect(
          sizeRegion,
        ).toHaveTextContent(
          '100%',
        )

        fireEvent.click(
          screen.getByRole(
            'button',
            {
              name:
                'Increase artwork size',
            },
          ),
        )

        await waitFor(
          () =>
            expect(
              element.getAttribute(
                'scale',
              ),
            ).toBe(
              '1.05 1.05 1.05',
            ),
        )

        expect(
          sizeRegion,
        ).toHaveTextContent(
          '111.3 × 58.8 cm',
        )

        expect(
          sizeRegion,
        ).toHaveTextContent(
          '105%',
        )
      },
    )

    it(
      'supports slider scaling and reset',
      async () => {
        const {
          element,
        } =
          await setup()

        const slider =
          screen.getByRole(
            'slider',
            {
              name:
                'Artwork size',
            },
          )

        fireEvent.change(
          slider,
          {
            target: {
              value:
                '125',
            },
          },
        )

        await waitFor(
          () =>
            expect(
              element.getAttribute(
                'scale',
              ),
            ).toBe(
              '1.25 1.25 1.25',
            ),
        )

        expect(
          screen.getByRole(
            'region',
            {
              name:
                'Artwork size',
            },
          ),
        ).toHaveTextContent(
          '132.5 × 70 cm',
        )

        fireEvent.click(
          screen.getByRole(
            'button',
            {
              name:
                'Reset artwork size',
            },
          ),
        )

        await waitFor(
          () =>
            expect(
              element.getAttribute(
                'scale',
              ),
            ).toBe(
              '1 1 1',
            ),
        )
      },
    )

    it(
      'launches the actual element API from the explicit click only',
      async () => {
        const {
          element,
        } =
          await setup()

        act(() => {
          element.loaded =
            true

          element.canActivateAR =
            true

          element.dispatchEvent(
            new Event(
              'load',
            ),
          )
        })

        expect(
          activateAR,
        ).not.toHaveBeenCalled()

        fireEvent.click(
          screen.getByRole(
            'button',
            {
              name:
                'View in your space',
            },
          ),
        )

        expect(
          activateAR,
        ).toHaveBeenCalledOnce()
      },
    )

    it(
      'reports scanning and placed states from real AR status events',
      async () => {
        const {
          element,
        } =
          await setup()

        act(() => {
          element.dispatchEvent(
            new CustomEvent(
              'ar-status',
              {
                detail: {
                  status:
                    'session-started',
                },
              },
            ),
          )
        })

        expect(
          screen.getByText(
            /Scan the wall slowly\. ArtVault size controls/i,
          ),
        ).toBeInTheDocument()

        const hint =
          element.querySelector(
            '[data-artvault-ar-hint]',
          ) as HTMLDivElement

        expect(
          hint,
        ).not.toBeNull()

        expect(
          hint.textContent,
        ).toContain(
          'Scan the wall slowly',
        )

        expect(
          hint.textContent,
        ).toContain(
          'Black frame',
        )

        expect(
          hint.textContent,
        ).toContain(
          '100% size',
        )

        expect(
          hint.style.display,
        ).toBe(
          'block',
        )

        const sizePanel =
          element.querySelector(
            '[data-artvault-size-controls]',
          ) as HTMLDivElement

        expect(
          sizePanel,
        ).not.toBeNull()

        expect(
          sizePanel.style.display,
        ).toBe(
          'block',
        )

        act(() => {
          element.dispatchEvent(
            new CustomEvent(
              'ar-status',
              {
                detail: {
                  status:
                    'object-placed',
                },
              },
            ),
          )
        })

        expect(
          screen.getByText(
            /The artwork is placed/i,
          ),
        ).toBeInTheDocument()

        expect(
          hint.textContent,
        ).toContain(
          'Drag it to reposition',
        )

        expect(
          hint.textContent,
        ).toContain(
          'adjust the size, then tap Lock position',
        )
      },
    )

    it(
      'updates the WebXR size controls with the selected percentage',
      async () => {
        const {
          element,
        } =
          await setup()

        act(() => {
          element.dispatchEvent(
            new CustomEvent(
              'ar-status',
              {
                detail: {
                  status:
                    'object-placed',
                },
              },
            ),
          )
        })

        const arPanel =
          element.querySelector(
            '[data-artvault-size-controls]',
          ) as HTMLDivElement

        expect(
          arPanel,
        ).not.toBeNull()

        const arIncrease =
          arPanel.querySelector(
            '[aria-label="Increase artwork size"]',
          ) as HTMLButtonElement

        fireEvent.click(
          arIncrease,
        )

        await waitFor(
          () =>
            expect(
              element.getAttribute(
                'scale',
              ),
            ).toBe(
              '1.05 1.05 1.05',
            ),
        )

        expect(
          arPanel.textContent,
        ).toContain(
          '111.3 × 58.8 cm',
        )

        expect(
          arPanel.textContent,
        ).toContain(
          '105%',
        )
      },
    )

    it(
      'reports AR tracking loss and restores placed guidance when tracking returns',
      async () => {
        const {
          element,
        } =
          await setup()

        act(() => {
          element.dispatchEvent(
            new CustomEvent(
              'ar-status',
              {
                detail: {
                  status:
                    'object-placed',
                },
              },
            ),
          )

          element.dispatchEvent(
            new CustomEvent(
              'ar-tracking',
              {
                detail: {
                  status:
                    'not-tracking',
                },
              },
            ),
          )
        })

        expect(
          screen.getByRole(
            'alert',
          ),
        ).toHaveTextContent(
          'tracking is temporarily unstable',
        )

        const hint =
          element.querySelector(
            '[data-artvault-ar-hint]',
          ) as HTMLDivElement

        expect(
          hint.textContent,
        ).toContain(
          'AR tracking is unstable',
        )

        act(() => {
          element.dispatchEvent(
            new CustomEvent(
              'ar-tracking',
              {
                detail: {
                  status:
                    'tracking',
                },
              },
            ),
          )
        })

        expect(
          screen.queryByText(
            /tracking is temporarily unstable/i,
          ),
        ).not.toBeInTheDocument()

        expect(
          hint.textContent,
        ).toContain(
          'Drag it to reposition',
        )

        expect(
          hint.textContent,
        ).toContain(
          'adjust the size, then tap Lock position',
        )
      },
    )

    it(
      'keeps an image fallback after model failure and releases the viewer',
      async () => {
        const {
          element,
          unmount,
        } =
          await setup()

        act(() => {
          element.dispatchEvent(
            new Event(
              'error',
            ),
          )
        })

        expect(
          screen.getByRole(
            'alert',
          ),
        ).toHaveTextContent(
          'could not be loaded',
        )

        expect(
          screen.getByAltText(
            /image fallback/,
          ),
        ).toHaveAttribute(
          'src',
          '/image.jpg',
        )

        expect(
          screen.queryByRole(
            'button',
            {
              name:
                'View in your space',
            },
          ),
        ).not.toBeInTheDocument()

        unmount()

        expect(
          release,
        ).toHaveBeenCalledWith(
          element,
        )
      },
    )

    it(
      'reports launch rejection instead of reporting successful placement',
      async () => {
        const {
          element,
        } =
          await setup()

        act(() => {
          element.loaded =
            true

          element.canActivateAR =
            true

          element.dispatchEvent(
            new Event(
              'load',
            ),
          )
        })

        activateAR
          .mockRejectedValueOnce(
            new Error(
              'permission denied',
            ),
          )

        fireEvent.click(
          screen.getByRole(
            'button',
            {
              name:
                'View in your space',
            },
          ),
        )

        await waitFor(
          () =>
            expect(
              screen.getByRole(
                'alert',
              ),
            ).toHaveTextContent(
              'could not start',
            ),
        )
      },
    )

    it(
      'handles a failed dependency load without a fake AR action',
      async () => {
        loadViewer
          .mockRejectedValueOnce(
            new Error(
              'offline',
            ),
          )

        render(
          <ArtworkArViewer
            proof={proof}
            title="Artwork"
          />,
        )

        await waitFor(
          () =>
            expect(
              screen.getByRole(
                'alert',
              ),
            ).toHaveTextContent(
              'viewer could not load',
            ),
        )

        expect(
          screen.queryByRole(
            'button',
            {
              name:
                'View in your space',
            },
          ),
        ).not.toBeInTheDocument()
      },
    )

    it(
      'retries a model failure with a fresh viewer',
      async () => {
        const {
          element,
          container,
        } =
          await setup()

        act(() => {
          element.dispatchEvent(
            new Event(
              'error',
            ),
          )
        })

        fireEvent.click(
          screen.getByRole(
            'button',
            {
              name:
                'Retry 3D preview',
            },
          ),
        )

        await waitFor(
          () =>
            expect(
              container
                .querySelector(
                  'model-viewer',
                ),
            ).not.toBe(
              element,
            ),
        )

        expect(
          release,
        ).toHaveBeenCalledWith(
          element,
        )

        const replacement =
          container
            .querySelector(
              'model-viewer',
            ) as unknown as
            FakeViewer

        act(() => {
          replacement.loaded =
            true

          replacement.dispatchEvent(
            new Event(
              'load',
            ),
          )
        })

        expect(
          screen.queryByRole(
            'alert',
          ),
        ).not.toBeInTheDocument()
      },
    )

    it(
      'retries a dependency download failure without reloading the page',
      async () => {
        loadViewer
          .mockRejectedValueOnce(
            new Error(
              'offline',
            ),
          )

        const {
          container,
        } =
          render(
            <ArtworkArViewer
              proof={proof}
              title="Artwork"
            />,
          )

        fireEvent.click(
          await screen.findByRole(
            'button',
            {
              name:
                'Retry 3D preview',
            },
          ),
        )

        await waitFor(
          () =>
            expect(
              container
                .querySelector(
                  'model-viewer',
                ),
            ).not.toBeNull(),
        )

        expect(
          loadViewer,
        ).toHaveBeenCalledTimes(
          2,
        )
      },
    )

    it(
      'does not attach a viewer if lazy loading finishes after unmount',
      async () => {
        let resolve!: (
          value: {
            release:
              typeof release
          },
        ) =>
          void

        loadViewer
          .mockReturnValueOnce(
            new Promise(
              (
                done,
              ) => {
                resolve =
                  done
              },
            ),
          )

        const {
          unmount,
        } =
          render(
            <ArtworkArViewer
              proof={proof}
              title="Artwork"
            />,
          )

        unmount()

        await act(
          async () =>
            resolve({
              release,
            }),
        )

        expect(
          document.querySelector(
            'model-viewer',
          ),
        ).toBeNull()

        expect(
          release,
        ).not.toHaveBeenCalled()
      },
    )
  },
)
