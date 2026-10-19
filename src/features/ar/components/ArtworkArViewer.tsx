import {
  useEffect,
  useRef,
  useState,
} from 'react'
import type {
  ModelViewerElement,
} from '@google/model-viewer'
import {
  Button,
} from '@/shared/ui'
import {
  loadViewer,
} from '../loadViewer'
import {
  AR_FRAME_LABELS,
  AR_FRAME_STYLES,
  type ArFrameStyle,
  type ArProof,
} from '../proof'

type ArStatus =
  | 'not-presenting'
  | 'session-started'
  | 'object-placed'
  | 'failed'

type ArTracking =
  | 'tracking'
  | 'not-tracking'

type AnchorLockStatus =
  | 'unlocked'
  | 'locking'
  | 'anchored'
  | 'local-lock'
  | 'lost'
  | 'recovered'

function isAnchorLockStatus(
  value: string,
): value is AnchorLockStatus {
  return (
    value ===
      'unlocked' ||
    value ===
      'locking' ||
    value ===
      'anchored' ||
    value ===
      'local-lock' ||
    value ===
      'lost' ||
    value ===
      'recovered'
  )
}

const MIN_SCALE_PERCENT =
  35

const MAX_SCALE_PERCENT =
  300

const SCALE_STEP_PERCENT =
  5

const FRAME_SWATCHES: Record<
  ArFrameStyle,
  string
> = {
  black:
    'linear-gradient(135deg,#050505,#303030)',

  walnut:
    'linear-gradient(135deg,#3f2719,#8a5b3b,#4b2c1c)',

  white:
    'linear-gradient(135deg,#fffdf7,#ded8cc)',

  gold:
    'linear-gradient(135deg,#75500d,#d9b65a,#8d6619)',
}

function clampScalePercent(
  value: number,
): number {
  if (
    !Number.isFinite(
      value,
    )
  ) {
    return 100
  }

  return Math.min(
    MAX_SCALE_PERCENT,
    Math.max(
      MIN_SCALE_PERCENT,
      Math.round(
        value /
          SCALE_STEP_PERCENT,
      ) *
        SCALE_STEP_PERCENT,
    ),
  )
}

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

function scaledMillimetres(
  millimetres: number,
  scalePercent: number,
): number {
  return (
    millimetres *
    scalePercent /
    100
  )
}

function modelScaleValue(
  scalePercent: number,
): string {
  const scale =
    scalePercent /
    100

  return `${scale} ${scale} ${scale}`
}

function isArStatus(
  value: string,
): value is ArStatus {
  return (
    value ===
      'not-presenting' ||
    value ===
      'session-started' ||
    value ===
      'object-placed' ||
    value ===
      'failed'
  )
}

function isArTracking(
  value: string,
): value is ArTracking {
  return (
    value ===
      'tracking' ||
    value ===
      'not-tracking'
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
    useRef<
      ModelViewerElement |
      null
    >(
      null,
    )

  const arSizePanel =
    useRef<HTMLDivElement | null>(
      null,
    )

  const arSizeReadout =
    useRef<HTMLDivElement | null>(
      null,
    )

  const arScaleReadout =
    useRef<HTMLSpanElement | null>(
      null,
    )

  const arScaleSlider =
    useRef<HTMLInputElement | null>(
      null,
    )

  const [
    selectedFrame,
    setSelectedFrame,
  ] =
    useState<
      ArFrameStyle
    >(
      proof.defaultFrame,
    )

  const [
    scalePercent,
    setScalePercent,
  ] =
    useState(
      100,
    )

  const [
    loaded,
    setLoaded,
  ] =
    useState(
      false,
    )

  const [
    capable,
    setCapable,
  ] =
    useState(
      false,
    )

  const [
    error,
    setError,
  ] =
    useState<
      string |
      null
    >(
      null,
    )

  const [
    arStatus,
    setArStatus,
  ] =
    useState<
      ArStatus
    >(
      'not-presenting',
    )

  const [
    tracking,
    setTracking,
  ] =
    useState<
      ArTracking |
      null
    >(
      null,
    )

  const [
    anchorStatus,
    setAnchorStatus,
  ] =
    useState<
      AnchorLockStatus
    >(
      'unlocked',
    )

  const [
    attempt,
    setAttempt,
  ] =
    useState(
      0,
    )

  useEffect(
    () => {
      setSelectedFrame(
        proof.defaultFrame,
      )

      setScalePercent(
        100,
      )
    },
    [
      proof.version,
      proof.defaultFrame,
    ],
  )

  const selectedVariant =
    proof.frames[
      selectedFrame
    ]

  const selectedFrameLabel =
    AR_FRAME_LABELS[
      selectedFrame
    ]

  const scaledWidthMm =
    scaledMillimetres(
      proof.widthMm,
      scalePercent,
    )

  const scaledHeightMm =
    scaledMillimetres(
      proof.heightMm,
      scalePercent,
    )

  const displayWidth =
    formatCm(
      proof.widthMm,
    )

  const displayHeight =
    formatCm(
      proof.heightMm,
    )

  const scaledDisplayWidth =
    formatCm(
      scaledWidthMm,
    )

  const scaledDisplayHeight =
    formatCm(
      scaledHeightMm,
    )

  const frameWidth =
    formatCm(
      proof.frameMm,
    )

  const updateScale =
    (
      requestedPercent:
        number,
    ) => {
      setScalePercent(
        clampScalePercent(
          requestedPercent,
        ),
      )
    }

  /*
   * Keep both the normal preview and
   * the active WebXR scene synchronized
   * with ArtVault's exact scale.
   */
  useEffect(
    () => {
      const element =
        viewer.current

      if (
        element
      ) {
        element.setAttribute(
          'scale',
          modelScaleValue(
            scalePercent,
          ),
        )
      }

      if (
        arSizeReadout.current
      ) {
        arSizeReadout.current
          .textContent =
          `${scaledDisplayWidth} × ${scaledDisplayHeight} cm`
      }

      if (
        arScaleReadout.current
      ) {
        arScaleReadout.current
          .textContent =
          `${scalePercent}%`
      }

      if (
        arScaleSlider.current
      ) {
        arScaleSlider.current
          .value =
          String(
            scalePercent,
          )
      }
    },
    [
      scalePercent,
      scaledDisplayWidth,
      scaledDisplayHeight,
    ],
  )

  useEffect(
    () => {
      setLoaded(
        false,
      )

      setCapable(
        false,
      )

      setError(
        null,
      )

      setArStatus(
        'not-presenting',
      )

      setTracking(
        null,
      )

      setAnchorStatus(
        'unlocked',
      )

      let disposed =
        false

      let clean =
        () => {}

      void loadViewer()
        .then(
          (
            adapter,
          ) => {
            if (
              disposed ||
              !host.current
            ) {
              return
            }

            const element =
              document
                .createElement(
                  'model-viewer',
                ) as
                ModelViewerElement

            viewer.current =
              element

            element.setAttribute(
              'alt',
              `${title} - ${selectedFrameLabel.toLowerCase()} framed artwork AR preview`,
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

            /*
             * Preserve the physically
             * proven AR path.
             */
            element.setAttribute(
              'ar-modes',
              'webxr scene-viewer',
            )

            element.setAttribute(
              'ar-placement',
              'wall',
            )

            /*
             * ArtVault now owns scaling.
             *
             * Native pinch is disabled so
             * the percentage and cm values
             * can never drift away from
             * the actual WebXR model size.
             */
            element.setAttribute(
              'ar-scale',
              'fixed',
            )

            element.setAttribute(
              'scale',
              modelScaleValue(
                scalePercent,
              ),
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

            if (
              poster
            ) {
              element.setAttribute(
                'poster',
                poster,
              )
            }

            const arButtonSlot =
              document.createElement(
                'span',
              )

            arButtonSlot.slot =
              'ar-button'

            element.append(
              arButtonSlot,
            )

            /*
             * AR placement/tracking hint.
             */
            const arHint =
              document.createElement(
                'div',
              )

            arHint.setAttribute(
              'data-artvault-ar-hint',
              '',
            )

            arHint.setAttribute(
              'role',
              'status',
            )

            arHint.setAttribute(
              'aria-live',
              'polite',
            )

            arHint.style.cssText = [
              'display:none',
              'position:absolute',
              'left:1rem',
              'right:1rem',
              'top:1rem',
              'z-index:10',
              'padding:.75rem 1rem',
              'border-radius:.75rem',
              'background:rgba(0,0,0,.72)',
              'color:#fff',
              'font:500 14px/1.4 system-ui,sans-serif',
              'text-align:center',
              'pointer-events:none',
            ].join(';')

            element.append(
              arHint,
            )

            /*
             * Custom ArtVault WebXR
             * size controller.
             */
            const sizePanel =
              document.createElement(
                'div',
              )

            sizePanel.setAttribute(
              'data-artvault-size-controls',
              '',
            )

            sizePanel.style.cssText = [
              'display:none',
              'position:absolute',
              'left:1rem',
              'right:1rem',
              'bottom:1rem',
              'z-index:20',
              'padding:.85rem 1rem',
              'border:1px solid rgba(255,255,255,.18)',
              'border-radius:1rem',
              'background:rgba(3,7,18,.82)',
              'backdrop-filter:blur(12px)',
              'color:#fff',
              'font:500 14px/1.4 system-ui,sans-serif',
              'pointer-events:auto',
            ].join(';')

            const sizeTitle =
              document.createElement(
                'div',
              )

            sizeTitle.textContent =
              'Estimated display size'

            sizeTitle.style.cssText =
              'font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,.62)'

            const sizeValue =
              document.createElement(
                'div',
              )

            sizeValue.textContent =
              `${scaledDisplayWidth} × ${scaledDisplayHeight} cm`

            sizeValue.style.cssText =
              'margin-top:.15rem;font-size:20px;font-weight:750;color:#a5f3fc'

            arSizeReadout.current =
              sizeValue

            const scaleRow =
              document.createElement(
                'div',
              )

            scaleRow.style.cssText =
              'display:flex;align-items:center;justify-content:space-between;margin-top:.5rem'

            const scaleLabel =
              document.createElement(
                'span',
              )

            scaleLabel.textContent =
              'Scale'

            scaleLabel.style.cssText =
              'font-size:12px;color:rgba(255,255,255,.68)'

            const scaleValue =
              document.createElement(
                'span',
              )

            scaleValue.textContent =
              `${scalePercent}%`

            scaleValue.style.cssText =
              'font-size:15px;font-weight:700;color:#a5f3fc'

            arScaleReadout.current =
              scaleValue

            scaleRow.append(
              scaleLabel,
              scaleValue,
            )

            const slider =
              document.createElement(
                'input',
              )

            slider.type =
              'range'

            slider.min =
              String(
                MIN_SCALE_PERCENT,
              )

            slider.max =
              String(
                MAX_SCALE_PERCENT,
              )

            slider.step =
              String(
                SCALE_STEP_PERCENT,
              )

            slider.value =
              String(
                scalePercent,
              )

            slider.setAttribute(
              'aria-label',
              'Artwork size',
            )

            slider.style.cssText =
              'display:block;width:100%;margin:.7rem 0;accent-color:#67e8f9;touch-action:none'

            arScaleSlider.current =
              slider

            const buttonRow =
              document.createElement(
                'div',
              )

            buttonRow.style.cssText =
              'display:grid;grid-template-columns:1fr 1fr 1fr;gap:.5rem'

            const createControlButton =
              (
                label: string,
                ariaLabel: string,
                onClick:
                  () => void,
              ) => {
                const button =
                  document.createElement(
                    'button',
                  )

                button.type =
                  'button'

                button.textContent =
                  label

                button.setAttribute(
                  'aria-label',
                  ariaLabel,
                )

                button.style.cssText = [
                  'min-height:42px',
                  'border:1px solid rgba(255,255,255,.2)',
                  'border-radius:.7rem',
                  'background:rgba(255,255,255,.1)',
                  'color:#fff',
                  'font:700 15px system-ui,sans-serif',
                  'touch-action:manipulation',
                ].join(';')

                button.addEventListener(
                  'click',
                  onClick,
                )

                return button
              }

            const decrease =
              createControlButton(
                '−',
                'Decrease artwork size',
                () => {
                  setScalePercent(
                    (
                      current,
                    ) =>
                      clampScalePercent(
                        current -
                          SCALE_STEP_PERCENT,
                      ),
                  )
                },
              )

            const reset =
              createControlButton(
                '100%',
                'Reset artwork size',
                () => {
                  setScalePercent(
                    100,
                  )
                },
              )

            const increase =
              createControlButton(
                '+',
                'Increase artwork size',
                () => {
                  setScalePercent(
                    (
                      current,
                    ) =>
                      clampScalePercent(
                        current +
                          SCALE_STEP_PERCENT,
                      ),
                  )
                },
              )

            buttonRow.append(
              decrease,
              reset,
              increase,
            )

            /*
             * Manual placement lock.
             *
             * The renderer remains fully
             * movable until the user asks
             * ArtVault to lock it.
             */
            const lockButton =
              document.createElement(
                'button',
              )

            lockButton.type =
              'button'

            lockButton.textContent =
              '🔒 Lock position'

            lockButton.setAttribute(
              'aria-label',
              'Lock artwork position',
            )

            lockButton.style.cssText = [
              'display:block',
              'width:100%',
              'min-height:44px',
              'margin-top:.65rem',
              'border:1px solid rgba(103,232,249,.45)',
              'border-radius:.75rem',
              'background:rgba(103,232,249,.16)',
              'color:#cffafe',
              'font:750 14px system-ui,sans-serif',
              'touch-action:manipulation',
            ].join(';')

            let currentAnchorStatus:
              AnchorLockStatus =
                'unlocked'

            const syncLockButton =
              (
                status:
                  AnchorLockStatus,
              ) => {
                currentAnchorStatus =
                  status

                const locked =
                  status ===
                    'anchored' ||
                  status ===
                    'local-lock' ||
                  status ===
                    'lost' ||
                  status ===
                    'recovered'

                const locking =
                  status ===
                    'locking'

                lockButton.disabled =
                  locking

                lockButton.textContent =
                  locking
                    ? 'Locking position…'
                    : locked
                      ? '🔓 Unlock position'
                      : '🔒 Lock position'

                lockButton.setAttribute(
                  'aria-label',
                  locked
                    ? 'Unlock artwork position'
                    : 'Lock artwork position',
                )

                lockButton.style.opacity =
                  locking
                    ? '.65'
                    : '1'

                lockButton.style.cursor =
                  locking
                    ? 'wait'
                    : 'pointer'
              }

            const onLockButton =
              () => {
                const locked =
                  currentAnchorStatus ===
                    'anchored' ||
                  currentAnchorStatus ===
                    'local-lock' ||
                  currentAnchorStatus ===
                    'lost' ||
                  currentAnchorStatus ===
                    'recovered'

                if (
                  currentAnchorStatus ===
                    'locking'
                ) {
                  return
                }

                element.dispatchEvent(
                  new CustomEvent(
                    locked
                      ? 'artvault-unlock-position'
                      : 'artvault-lock-position',
                  ),
                )
              }

            lockButton.addEventListener(
              'click',
              onLockButton,
            )

            sizePanel.append(
              sizeTitle,
              sizeValue,
              scaleRow,
              slider,
              buttonRow,
              lockButton,
            )

            /*
             * Stop interaction with the
             * slider/buttons from also
             * moving the AR object.
             */
            const preventXrSelect =
              (
                event:
                  Event,
              ) => {
                event.preventDefault()
              }

            sizePanel.addEventListener(
              'beforexrselect',
              preventXrSelect,
            )

            const onSlider =
              () => {
                const next =
                  Number(
                    slider.value,
                  )

                setScalePercent(
                  clampScalePercent(
                    next,
                  ),
                )
              }

            slider.addEventListener(
              'input',
              onSlider,
            )

            element.append(
              sizePanel,
            )

            arSizePanel.current =
              sizePanel

            let currentStatus:
              ArStatus =
                'not-presenting'

            const setArHint =
              (
                message:
                  | string
                  | null,
              ) => {
                if (
                  !message
                ) {
                  arHint.textContent =
                    ''

                  arHint.style.display =
                    'none'

                  return
                }

                arHint.textContent =
                  message

                arHint.style.display =
                  'block'
              }

            const setSizePanelVisible =
              (
                visible:
                  boolean,
              ) => {
                sizePanel.style.display =
                  visible
                    ? 'block'
                    : 'none'
              }

            const showHintForStatus =
              () => {
                if (
                  currentStatus ===
                    'session-started'
                ) {
                  setArHint(
                    `Scan the wall slowly. ${selectedFrameLabel} frame · ${scalePercent}% size.`,
                  )

                  return
                }

                if (
                  currentStatus ===
                    'object-placed'
                ) {
                  if (
                    currentAnchorStatus ===
                      'unlocked'
                  ) {
                    setArHint(
                      'Artwork placed and unlocked. Drag it to reposition, adjust the size, then tap Lock position when ready.',
                    )
                  }

                  return
                }

                setArHint(
                  null,
                )
              }

            const sync =
              () => {
                if (
                  !disposed
                ) {
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

                setArHint(
                  null,
                )

                setSizePanelVisible(
                  false,
                )

                setError(
                  'The selected framed 3D model could not be loaded. The artwork image remains available.',
                )
              }

            const onStatus =
              (
                event:
                  Event,
              ) => {
                const value =
                  (
                    event as
                      CustomEvent<{
                        status?: string
                      }>
                  ).detail
                    ?.status

                if (
                  !value ||
                  !isArStatus(
                    value,
                  )
                ) {
                  return
                }

                currentStatus =
                  value

                setArStatus(
                  value,
                )

                if (
                  value ===
                    'not-presenting'
                ) {
                  setTracking(
                    null,
                  )

                  setArHint(
                    null,
                  )

                  setSizePanelVisible(
                    false,
                  )
                } else if (
                  value ===
                    'session-started'
                ) {
                  setSizePanelVisible(
                    true,
                  )

                  showHintForStatus()
                } else if (
                  value ===
                    'object-placed'
                ) {
                  setSizePanelVisible(
                    true,
                  )

                  showHintForStatus()
                } else if (
                  value ===
                    'failed'
                ) {
                  setTracking(
                    null,
                  )

                  setArHint(
                    null,
                  )

                  setSizePanelVisible(
                    false,
                  )

                  setError(
                    'AR could not start. Check device support and camera permission, or use the 3D preview.',
                  )
                }

                sync()
              }

            const onAnchorState =
              (
                event:
                  Event,
              ) => {
                const value =
                  (
                    event as
                      CustomEvent<{
                        status?: string
                      }>
                  ).detail
                    ?.status

                if (
                  !value ||
                  !isAnchorLockStatus(
                    value,
                  )
                ) {
                  return
                }

                setAnchorStatus(
                  value,
                )

                syncLockButton(
                  value,
                )

                if (
                  value ===
                    'unlocked'
                ) {
                  setArHint(
                    currentStatus ===
                      'object-placed'
                      ? 'Position unlocked. Drag the artwork to reposition it, then tap Lock position when ready.'
                      : 'Position unlocked. Place the artwork on the wall, then tap Lock position when ready.',
                  )

                  return
                }

                if (
                  value ===
                    'locking'
                ) {
                  setArHint(
                    'Locking the current wall position…',
                  )

                  return
                }

                if (
                  value ===
                    'anchored'
                ) {
                  setArHint(
                    'Position locked to the wall ✓ Move the phone to inspect the artwork. Tap Unlock position to move it again.',
                  )

                  return
                }

                if (
                  value ===
                    'local-lock'
                ) {
                  setArHint(
                    'Position locked for this AR session. Tap Unlock position to move the artwork again.',
                  )

                  return
                }

                if (
                  value ===
                    'lost'
                ) {
                  setArHint(
                    'Anchor tracking is temporarily lost. Keep the camera pointed at the wall and nearby edges. You can still tap Unlock position.',
                  )

                  return
                }

                setArHint(
                  'Wall anchor recovered ✓ Position remains locked. Tap Unlock position to move it again.',
                )
              }

            const onTracking =
              (
                event:
                  Event,
              ) => {
                const value =
                  (
                    event as
                      CustomEvent<{
                        status?: string
                      }>
                  ).detail
                    ?.status

                if (
                  !value ||
                  !isArTracking(
                    value,
                  )
                ) {
                  return
                }

                setTracking(
                  value,
                )

                if (
                  value ===
                    'not-tracking'
                ) {
                  setArHint(
                    'AR tracking is unstable. Point the camera at visible wall edges or texture and move the phone slowly.',
                  )

                  return
                }

                showHintForStatus()
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

            element.addEventListener(
              'ar-tracking',
              onTracking,
            )

            element.addEventListener(
              'artvault-anchor-state',
              onAnchorState,
            )

            element.setAttribute(
              'src',
              selectedVariant
                .modelUrl,
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

            clean =
              () => {
                window.clearInterval(
                  capabilityTimer,
                )

                window.clearTimeout(
                  loadTimer,
                )

                slider.removeEventListener(
                  'input',
                  onSlider,
                )

                sizePanel.removeEventListener(
                  'beforexrselect',
                  preventXrSelect,
                )

                lockButton.removeEventListener(
                  'click',
                  onLockButton,
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

                element.removeEventListener(
                  'ar-tracking',
                  onTracking,
                )

                element.removeEventListener(
                  'artvault-anchor-state',
                  onAnchorState,
                )

                if (
                  arSizePanel.current ===
                    sizePanel
                ) {
                  arSizePanel.current =
                    null
                }

                if (
                  arSizeReadout.current ===
                    sizeValue
                ) {
                  arSizeReadout.current =
                    null
                }

                if (
                  arScaleReadout.current ===
                    scaleValue
                ) {
                  arScaleReadout.current =
                    null
                }

                if (
                  arScaleSlider.current ===
                    slider
                ) {
                  arScaleSlider.current =
                    null
                }

                adapter.release(
                  element,
                )

                viewer.current =
                  null
              }
          },
        )
        .catch(
          () => {
            if (
              !disposed
            ) {
              setError(
                'The 3D viewer could not load. You can still view the artwork image.',
              )
            }
          },
        )

      return () => {
        disposed =
          true

        clean()
      }
    },
    [
      selectedVariant
        .modelUrl,

      selectedFrameLabel,

      title,
      poster,
      attempt,
    ],
  )

  const launch =
    () => {
      const element =
        viewer.current

      if (
        !element?.loaded ||
        !element.canActivateAR
      ) {
        return
      }

      setError(
        null,
      )

      setTracking(
        null,
      )

      setAnchorStatus(
        'unlocked',
      )

      void element
        .activateAR()
        .catch(
          () => {
            setArStatus(
              'failed',
            )

            setError(
              'AR could not start. Check device support and camera permission, or use the 3D preview.',
            )
          },
        )
    }

  const frameSelectionLocked =
    arStatus ===
      'session-started' ||
    arStatus ===
      'object-placed'

  return (
    <section
      className="flex min-w-0 flex-col gap-3"
      aria-label="Development AR proof"
    >
      <h2 className="font-display text-lg">
        Framed AR preview
      </h2>

      <p className="text-sm text-text-secondary">
        Estimated base display
        size:{' '}
        {displayWidth}{' '}
        {'\u00d7'}{' '}
        {displayHeight} cm,
        including a{' '}
        {frameWidth} cm frame.
      </p>

      <p className="text-xs text-text-muted">
        This is an estimated
        visualization size, not a
        verified physical
        measurement.
      </p>

      <fieldset
        className="rounded-xl border border-border bg-surface-elevated p-3"
        disabled={
          frameSelectionLocked
        }
      >
        <legend className="px-1 text-sm font-semibold">
          Choose frame
        </legend>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {AR_FRAME_STYLES.map(
            (
              style,
            ) => {
              const selected =
                style ===
                  selectedFrame

              return (
                <button
                  key={
                    style
                  }
                  type="button"
                  aria-pressed={
                    selected
                  }
                  onClick={() => {
                    setSelectedFrame(
                      style,
                    )
                  }}
                  className={`flex min-h-12 items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${
                    selected
                      ? 'border-info bg-info/10 font-semibold'
                      : 'border-border bg-surface hover:border-text-muted'
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  <span
                    aria-hidden="true"
                    className="h-7 w-7 shrink-0 rounded-md border border-black/20 shadow-inner"
                    style={{
                      background:
                        FRAME_SWATCHES[
                          style
                        ],
                    }}
                  />

                  <span>
                    {
                      AR_FRAME_LABELS[
                        style
                      ]
                    }
                  </span>
                </button>
              )
            },
          )}
        </div>

        <p className="mt-2 text-xs text-text-muted">
          Selected frame:{' '}
          <strong>
            {
              selectedFrameLabel
            }
          </strong>
        </p>
      </fieldset>

      <section
        className="rounded-xl border border-border bg-surface-elevated p-4"
        aria-label="Artwork size"
      >
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-text-muted">
              Estimated display size
            </p>

            <p className="mt-1 text-xl font-semibold">
              {scaledDisplayWidth}{' '}
              {'\u00d7'}{' '}
              {scaledDisplayHeight} cm
            </p>
          </div>

          <p className="text-lg font-semibold">
            {scalePercent}%
          </p>
        </div>

        <input
          type="range"
          min={
            MIN_SCALE_PERCENT
          }
          max={
            MAX_SCALE_PERCENT
          }
          step={
            SCALE_STEP_PERCENT
          }
          value={
            scalePercent
          }
          aria-label="Artwork size"
          onChange={(
            event,
          ) => {
            updateScale(
              Number(
                event.target
                  .value,
              ),
            )
          }}
          className="mt-4 w-full"
        />

        <div className="mt-1 flex justify-between text-xs text-text-muted">
          <span>
            {MIN_SCALE_PERCENT}%
          </span>

          <span>
            {MAX_SCALE_PERCENT}%
          </span>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <button
            type="button"
            aria-label="Decrease artwork size"
            onClick={() => {
              updateScale(
                scalePercent -
                  SCALE_STEP_PERCENT,
              )
            }}
            className="rounded-lg border border-border px-3 py-2 font-semibold"
          >
            −
          </button>

          <button
            type="button"
            aria-label="Reset artwork size"
            onClick={() => {
              updateScale(
                100,
              )
            }}
            className="rounded-lg border border-border px-3 py-2 font-semibold"
          >
            Reset
          </button>

          <button
            type="button"
            aria-label="Increase artwork size"
            onClick={() => {
              updateScale(
                scalePercent +
                  SCALE_STEP_PERCENT,
              )
            }}
            className="rounded-lg border border-border px-3 py-2 font-semibold"
          >
            +
          </button>
        </div>

        <p className="mt-3 text-xs text-text-muted">
          The same size controls
          are available during
          WebXR camera AR. ArtVault
          controls the scale so the
          centimetre measurement
          stays synchronized.
        </p>
      </section>

      <div
        ref={
          host
        }
        className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface-elevated"
      />

      {!loaded &&
        !error && (
          <p role="status">
            Loading{' '}
            {selectedFrameLabel.toLowerCase()}{' '}
            framed 3D preview...
          </p>
        )}

      {error && (
        <div role="alert">
          <p>
            {error}
          </p>

          {!loaded && (
            <Button
              onClick={() => {
                setError(
                  null,
                )

                setLoaded(
                  false,
                )

                setCapable(
                  false,
                )

                setArStatus(
                  'not-presenting',
                )

                setTracking(
                  null,
                )

                setAttempt(
                  (
                    value,
                  ) =>
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
            onClick={
              launch
            }
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

      {arStatus ===
        'session-started' && (
          <p role="status">
            Scan the wall slowly.
            ArtVault size controls
            are available in the
            WebXR camera view.
          </p>
        )}

      {arStatus ===
        'object-placed' && (
          <p role="status">
            The artwork is placed.
            Keep it unlocked while
            repositioning or resizing
            it, then use Lock position
            in the AR controls when
            you are satisfied.
          </p>
        )}

      {arStatus ===
        'object-placed' &&
        anchorStatus ===
          'locking' && (
          <p role="status">
            Locking the current
            artwork position…
          </p>
        )}

      {arStatus ===
        'object-placed' &&
        (
          anchorStatus ===
            'anchored' ||
          anchorStatus ===
            'local-lock' ||
          anchorStatus ===
            'recovered'
        ) && (
          <p role="status">
            The artwork position is
            locked. Use Unlock
            position in the AR
            controls before moving
            it again.
          </p>
        )}

      {tracking ===
        'not-tracking' && (
          <p role="alert">
            AR tracking is
            temporarily unstable.
            Keep the camera pointed
            at visible wall edges,
            texture, or nearby
            features and move the
            phone slowly until
            tracking recovers.
          </p>
        )}

      {poster && (
        <img
          src={
            poster
          }
          alt={`${title} - artwork image fallback`}
          className="max-h-64 w-full object-contain"
        />
      )}
    </section>
  )
}