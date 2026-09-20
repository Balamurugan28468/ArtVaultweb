import {
  useEffect,
  useRef,
  useState,
} from 'react'
import type { ModelViewerElement } from '@google/model-viewer'
import { Button } from '@/shared/ui'
import { loadViewer } from '../loadViewer'
import type { ArProof } from '../proof'

function formatCm(
  millimetres: number,
): string {
  const centimetres =
    millimetres / 10

  return Number.isInteger(
    centimetres,
  )
    ? String(
        centimetres,
      )
    : centimetres.toFixed(
        1,
      )
}

interface ArtworkArViewerProps {
  proof: ArProof
  title: string
  poster?: string
}

export function ArtworkArViewer({
  proof,
  title,
  poster,
}: ArtworkArViewerProps) {
  const host =
    useRef<HTMLDivElement>(
      null,
    )

  const viewer =
    useRef<ModelViewerElement | null>(
      null,
    )

  const [
    loaded,
    setLoaded,
  ] =
    useState(false)

  const [
    capable,
    setCapable,
  ] =
    useState(false)

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(null)

  const [
    session,
    setSession,
  ] =
    useState(false)

  const [
    attempt,
    setAttempt,
  ] =
    useState(0)

  useEffect(() => {
    setLoaded(false)
    setCapable(false)
    setSession(false)
    setError(null)

    let disposed = false
    let clean = () => {}

    void loadViewer()
      .then(
        (adapter) => {
          if (
            disposed ||
            !host.current
          ) {
            return
          }

          const element =
            document.createElement(
              'model-viewer',
            ) as ModelViewerElement

          viewer.current =
            element

          element.setAttribute(
            'alt',
            `${title} — framed artwork AR preview`,
          )

          element.setAttribute(
            'camera-controls',
            '',
          )

          element.setAttribute(
            'touch-action',
            'pan-y',
          )

          element.setAttribute(
            'ar',
            '',
          )

          // Android:
          // WebXR is attempted first.
          // Scene Viewer remains the
          // fallback.
          element.setAttribute(
            'ar-modes',
            'webxr scene-viewer',
          )

          element.setAttribute(
            'ar-placement',
            'wall',
          )

          // Keep the selected ArtVault
          // display size fixed instead of
          // allowing arbitrary scaling.
          element.setAttribute(
            'ar-scale',
            'fixed',
          )

          element.setAttribute(
            'loading',
            'eager',
          )

          element.setAttribute(
            'reveal',
            'auto',
          )

          element.style.cssText =
            'display:block;width:100%;height:26rem;max-height:65vh;min-height:16rem'

          if (poster) {
            element.setAttribute(
              'poster',
              poster,
            )
          }

          // Hide model-viewer's own AR
          // launch control. ArtVault uses
          // the button below so capability
          // and errors remain explicit.
          const slot =
            document.createElement(
              'span',
            )

          slot.slot =
            'ar-button'

          element.append(slot)

          const sync = () => {
            if (!disposed) {
              setCapable(
                element.loaded &&
                  element.canActivateAR,
              )
            }
          }

          const onLoad =
            () => {
              setLoaded(
                true,
              )

              setError(
                null,
              )

              sync()
            }

          const onError =
            () => {
              setLoaded(
                false,
              )

              setCapable(
                false,
              )

              setError(
                'The 3D model could not be loaded. The artwork image remains available.',
              )
            }

          const onStatus =
            (
              event: Event,
            ) => {
              const status =
                (
                  event as CustomEvent<{
                    status: string
                  }>
                ).detail
                  .status

              setSession(
                status ===
                  'session-started' ||
                  status ===
                    'object-placed',
              )

              if (
                status ===
                'failed'
              ) {
                setError(
                  'AR could not start. Check device support and camera permission, or use the 3D preview.',
                )
              }

              sync()
            }

          element.addEventListener(
            'load',
            onLoad,
          )

          element.addEventListener(
            'error',
            onError,
          )

          element.addEventListener(
            'ar-status',
            onStatus,
          )

          element.setAttribute(
            'src',
            proof.modelUrl,
          )

          host.current.append(
            element,
          )

          const capabilityTimer =
            window.setInterval(
              sync,
              500,
            )

          const loadTimer =
            window.setTimeout(
              () => {
                if (
                  !element.loaded
                ) {
                  onError()
                }
              },
              30000,
            )

          clean = () => {
            window.clearInterval(
              capabilityTimer,
            )

            window.clearTimeout(
              loadTimer,
            )

            element.removeEventListener(
              'load',
              onLoad,
            )

            element.removeEventListener(
              'error',
              onError,
            )

            element.removeEventListener(
              'ar-status',
              onStatus,
            )

            adapter.release(
              element,
            )

            viewer.current =
              null
          }
        },
      )
      .catch(() => {
        if (!disposed) {
          setError(
            'The 3D viewer could not load. You can still view the artwork image.',
          )
        }
      })

    return () => {
      disposed = true
      clean()
    }
  }, [
    proof.modelUrl,
    title,
    poster,
    attempt,
  ])

  const launch = () => {
    const element =
      viewer.current

    if (
      !element?.loaded ||
      !element.canActivateAR
    ) {
      return
    }

    setError(null)

    // Must happen directly inside the
    // user click for browser/native AR
    // activation.
    void element
      .activateAR()
      .catch(() =>
        setError(
          'AR could not start. Check device support and camera permission, or use the 3D preview.',
        ),
      )
  }

  const displayWidth =
    formatCm(
      proof.widthMm,
    )

  const displayHeight =
    formatCm(
      proof.heightMm,
    )

  const frameWidth =
    formatCm(
      proof.frameMm,
    )

  return (
    <section
      className="flex min-w-0 flex-col gap-3"
      aria-label="Development AR proof"
    >
      <h2 className="font-display text-lg">
        Framed AR preview
      </h2>

      <p className="text-sm text-text-secondary">
        Estimated display size:{' '}
        {displayWidth} ×{' '}
        {displayHeight} cm,
        including a{' '}
        {frameWidth} cm frame.
        The size is automatically
        selected from the artwork's
        aspect ratio because verified
        seller measurements are not
        available.
      </p>

      <p className="text-xs text-text-muted">
        This is a visualization
        estimate, not a verified
        measurement of the physical
        artwork. Placement accuracy
        also depends on the phone's
        AR tracking.
      </p>

      <div
        ref={host}
        className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface-elevated"
      />

      {!loaded &&
        !error && (
          <p role="status">
            Loading framed 3D
            preview…
          </p>
        )}

      {error && (
        <div role="alert">
          <p>{error}</p>

          {!loaded && (
            <Button
              onClick={() => {
                setError(null)
                setLoaded(false)
                setCapable(false)
                setAttempt(
                  (value) =>
                    value + 1,
                )
              }}
            >
              Retry 3D preview
            </Button>
          )}
        </div>
      )}

      {capable &&
        loaded && (
          <Button
            variant="info"
            onClick={launch}
          >
            View in your space
          </Button>
        )}

      {loaded &&
        !capable && (
          <p role="status">
            AR launch is
            unavailable in this
            browser. This is a
            3D preview, not camera
            placement. iPhone and
            iPad Quick Look are not
            enabled in this
            development proof.
          </p>
        )}

      {session && (
        <p role="status">
          Move the phone slowly
          so AR can detect the wall.
          Use the AR viewer's exit
          control to return to
          ArtVault.
        </p>
      )}

      {poster && (
        <img
          src={poster}
          alt={`${title} — artwork image fallback`}
          className="max-h-64 w-full object-contain"
        />
      )}
    </section>
  )
}