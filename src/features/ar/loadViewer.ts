import type {
  ModelViewerElement,
} from '@google/model-viewer'

type AnchorLockStatus =
  | 'unlocked'
  | 'locking'
  | 'anchored'
  | 'local-lock'
  | 'lost'
  | 'recovered'

interface InternalVector3 {
  x: number
  y: number
  z: number

  set(
    x: number,
    y: number,
    z: number,
  ): unknown
}

interface InternalQuaternion {
  set(
    x: number,
    y: number,
    z: number,
    w: number,
  ): unknown
}

interface InternalScenePivot {
  position: InternalVector3
  quaternion: InternalQuaternion
}

interface InternalPresentedScene {
  element: HTMLElement

  scenePivot:
    InternalScenePivot
}

interface InternalXrManager {
  cameraAutoUpdate:
    boolean

  setReferenceSpaceType(
    type: XRReferenceSpaceType,
  ): void

  setSession(
    session: XRSession,
  ): Promise<void>

  getReferenceSpace():
    XRReferenceSpace | null
}

interface InternalThreeRenderer {
  xr: InternalXrManager
}

interface InternalArRenderer {
  presentedScene?:
    InternalPresentedScene

  currentSession:
    XRSession | null

  placeOnWall:
    boolean

  threeRenderer:
    InternalThreeRenderer

  overlay?:
    HTMLElement | null

  frame?:
    XRFrame | null

  initialHitSource?:
    XRHitTestSource | null

  transientHitTestSource?:
    XRTransientInputHitTestSource | null

  goalPosition:
    InternalVector3

  goalYaw:
    number

  isTranslating?:
    boolean

  isRotating?:
    boolean

  isTwoHandInteraction?:
    boolean

  resolveARSession():
    Promise<XRSession>

  moveToFloor(
    frame: XRFrame,
  ): void

  onWebXRFrame(
    time: number,
    frame: XRFrame,
  ): void

  stopPresenting():
    Promise<void>
}

interface InternalRenderer {
  arRenderer:
    InternalArRenderer
}

interface AnchorCapableFrame
  extends XRFrame {
  createAnchor?(
    pose:
      XRRigidTransform,
    space:
      XRSpace,
  ): Promise<XRAnchor>
}

interface StableRendererState {
  anchor:
    XRAnchor | null

  anchorPending:
    boolean

  locked:
    boolean

  nativeAnchor:
    boolean

  lost:
    boolean

  session:
    XRSession | null

  position: {
    x: number
    y: number
    z: number
  }

  yaw:
    number

  lockRequested:
    boolean
}

const patchedPrototypes =
  new WeakSet<object>()

const patchedRenderers =
  new WeakSet<object>()

const rendererStates =
  new WeakMap<
    object,
    StableRendererState
  >()

function dispatchAnchorState(
  element:
    HTMLElement | undefined,
  status:
    AnchorLockStatus,
) {
  if (!element) {
    return
  }

  element.setAttribute(
    'data-artvault-anchor-lock',
    status,
  )

  element.dispatchEvent(
    new CustomEvent(
      'artvault-anchor-state',
      {
        detail: {
          status,
        },
      },
    ),
  )
}

function updateArtVaultHint(
  element:
    HTMLElement | undefined,
  message:
    string,
) {
  if (!element) {
    return
  }

  const hint =
    element.querySelector(
      '[data-artvault-ar-hint]',
    ) as
      | HTMLDivElement
      | null

  if (!hint) {
    return
  }

  hint.textContent =
    message

  hint.style.display =
    'block'
}

function deleteAnchor(
  state:
    StableRendererState,
) {
  const anchor =
    state.anchor

  state.anchor =
    null

  state.nativeAnchor =
    false

  if (!anchor) {
    return
  }

  try {
    anchor.delete()
  } catch {
    // The XR session may already
    // have ended.
  }
}

function resetAnchorState(
  state:
    StableRendererState,
) {
  deleteAnchor(
    state,
  )

  state.anchorPending =
    false

  state.locked =
    false

  state.nativeAnchor =
    false

  state.lost =
    false

  state.session =
    null

  state.position.x =
    0

  state.position.y =
    0

  state.position.z =
    0

  state.yaw =
    0

  state.lockRequested =
    false
}

function applyYaw(
  quaternion:
    InternalQuaternion,
  yaw:
    number,
) {
  const half =
    yaw / 2

  quaternion.set(
    0,
    Math.sin(
      half,
    ),
    0,
    Math.cos(
      half,
    ),
  )
}

function lockRendererToPosition(
  ar:
    InternalArRenderer,
  state:
    StableRendererState,
  x:
    number,
  y:
    number,
  z:
    number,
  yaw:
    number,
) {
  state.position.x =
    x

  state.position.y =
    y

  state.position.z =
    z

  state.yaw =
    yaw

  ar.goalPosition.set(
    x,
    y,
    z,
  )

  ar.goalYaw =
    yaw

  const scene =
    ar.presentedScene

  if (!scene) {
    return
  }

  scene.scenePivot
    .position
    .set(
      x,
      y,
      z,
    )

  applyYaw(
    scene
      .scenePivot
      .quaternion,
    yaw,
  )
}

function disableNativeRepositioning(
  ar:
    InternalArRenderer,
) {
  const transient =
    ar.transientHitTestSource

  if (transient) {
    try {
      transient.cancel()
    } catch {
      // Already cancelled.
    }
  }

  ar.transientHitTestSource =
    null

  ar.isTranslating =
    false

  ar.isRotating =
    false

  ar.isTwoHandInteraction =
    false
}

function restoreNativeRepositioning(
  ar:
    InternalArRenderer,
  state:
    StableRendererState,
) {
  const session =
    state.session

  if (
    !session ||
    ar.currentSession !==
      session
  ) {
    return
  }

  if (
    ar.transientHitTestSource
  ) {
    return
  }

  /*
   * TypeScript must narrow the
   * optional WebXR method before
   * we bind it.
   */
  const requestTransientHitTestForSession =
    session
      .requestHitTestSourceForTransientInput

  if (
    typeof requestTransientHitTestForSession !==
      'function'
  ) {
    return
  }

const requestTransientHitTest =
  requestTransientHitTestForSession as
    (
      options: {
        profile:
          string
      },
    ) =>
      Promise<XRTransientInputHitTestSource>

void requestTransientHitTest.call(
  session,
  {
    profile:
      'generic-touchscreen',
  },
)
    .then(
      (
        hitTestSource,
      ) => {
        /*
         * The asynchronous request
         * may finish after the XR
         * session ended or after the
         * artwork was locked again.
         */
        if (
          !state.session ||
          state.session !==
            session ||
          ar.currentSession !==
            session ||
          state.locked
        ) {
          try {
            hitTestSource.cancel()
          } catch {
            // Ignore stale source.
          }

          return
        }

        const existing =
          ar.transientHitTestSource

        if (existing) {
          try {
            hitTestSource.cancel()
          } catch {
            // Ignore duplicate source.
          }

          return
        }

        ar.transientHitTestSource =
          hitTestSource
      },
    )
    .catch(
      () => {
        /*
         * Unlock still succeeds if
         * this WebXR runtime does not
         * support transient input hit
         * testing.
         */
      },
    )
}

function captureCurrentPlacement(
  ar:
    InternalArRenderer,
  state:
    StableRendererState,
): boolean {
  const scene =
    ar.presentedScene

  if (!scene) {
    return false
  }

  const position =
    scene.scenePivot
      .position

  state.position.x =
    position.x

  state.position.y =
    position.y

  state.position.z =
    position.z

  state.yaw =
    ar.goalYaw

  return true
}

function useLocalLock(
  ar:
    InternalArRenderer,
  state:
    StableRendererState,
) {
  state.anchorPending =
    false

  state.lockRequested =
    false

  state.locked =
    true

  state.nativeAnchor =
    false

  disableNativeRepositioning(
    ar,
  )

  lockRendererToPosition(
    ar,
    state,
    state.position.x,
    state.position.y,
    state.position.z,
    state.yaw,
  )

  dispatchAnchorState(
    ar.presentedScene
      ?.element,
    'local-lock',
  )

  updateArtVaultHint(
    ar.presentedScene
      ?.element,
    'Position locked ✓ Native XR anchoring is unavailable, so ArtVault is keeping the current placement fixed locally.',
  )
}

async function createAnchorAtCurrentPlacement(
  ar:
    InternalArRenderer,
  state:
    StableRendererState,
  frame:
    XRFrame,
) {
  if (
    state.locked ||
    state.anchorPending
  ) {
    state.lockRequested =
      false

    return
  }

  if (
    !captureCurrentPlacement(
      ar,
      state,
    )
  ) {
    state.lockRequested =
      false

    return
  }

  state.lockRequested =
    false

  state.anchorPending =
    true

  /*
   * Freeze the current placement
   * immediately while native anchor
   * creation is pending.
   */
  state.locked =
    true

  disableNativeRepositioning(
    ar,
  )

  lockRendererToPosition(
    ar,
    state,
    state.position.x,
    state.position.y,
    state.position.z,
    state.yaw,
  )

  dispatchAnchorState(
    ar.presentedScene
      ?.element,
    'locking',
  )

  updateArtVaultHint(
    ar.presentedScene
      ?.element,
    'Locking the artwork at its current wall position…',
  )

  const referenceSpace =
    ar.threeRenderer
      .xr
      .getReferenceSpace()

  const anchorFrame =
    frame as
      AnchorCapableFrame

  if (
    !referenceSpace ||
    typeof anchorFrame
      .createAnchor !==
      'function'
  ) {
    useLocalLock(
      ar,
      state,
    )

    return
  }

  let anchor:
    XRAnchor | null =
      null

  try {
    const transform =
      new XRRigidTransform(
        {
          x:
            state.position.x,

          y:
            state.position.y,

          z:
            state.position.z,
        },
        {
          x: 0,
          y: 0,
          z: 0,
          w: 1,
        },
      )

    anchor =
      await anchorFrame
        .createAnchor(
          transform,
          referenceSpace,
        )
  } catch {
    anchor =
      null
  }

  state.anchorPending =
    false

  /*
   * The asynchronous anchor request
   * may complete after the session
   * ended or after Unlock was used.
   */
  if (
    !state.session ||
    ar.currentSession !==
      state.session ||
    !state.locked
  ) {
    try {
      anchor?.delete()
    } catch {
      // Ignore stale anchor.
    }

    return
  }

  if (!anchor) {
    useLocalLock(
      ar,
      state,
    )

    return
  }

  deleteAnchor(
    state,
  )

  state.anchor =
    anchor

  state.nativeAnchor =
    true

  state.locked =
    true

  disableNativeRepositioning(
    ar,
  )

  dispatchAnchorState(
    ar.presentedScene
      ?.element,
    'anchored',
  )

  updateArtVaultHint(
    ar.presentedScene
      ?.element,
    'Position locked to wall ✓ Move the phone to inspect the artwork. Tap Unlock position whenever you want to reposition it.',
  )
}

function applyAnchorPose(
  ar:
    InternalArRenderer,
  state:
    StableRendererState,
  frame:
    XRFrame,
) {
  if (
    !state.locked
  ) {
    return
  }

  disableNativeRepositioning(
    ar,
  )

  const anchor =
    state.anchor

  if (!anchor) {
    /*
     * Local fallback lock.
     */
    lockRendererToPosition(
      ar,
      state,
      state.position.x,
      state.position.y,
      state.position.z,
      state.yaw,
    )

    return
  }

  const referenceSpace =
    ar.threeRenderer
      .xr
      .getReferenceSpace()

  if (!referenceSpace) {
    return
  }

  const pose =
    frame.getPose(
      anchor.anchorSpace,
      referenceSpace,
    )

  if (!pose) {
    if (
      !state.lost
    ) {
      state.lost =
        true

      dispatchAnchorState(
        ar.presentedScene
          ?.element,
        'lost',
      )

      updateArtVaultHint(
        ar.presentedScene
          ?.element,
        'Anchor tracking temporarily lost. Keep the phone pointed at the wall and nearby visual features until tracking recovers.',
      )
    }

    /*
     * Do not select a different wall
     * while tracking is temporarily
     * unavailable.
     */
    return
  }

  const position =
    pose.transform
      .position

  lockRendererToPosition(
    ar,
    state,
    position.x,
    position.y,
    position.z,
    state.yaw,
  )

  if (
    state.lost
  ) {
    state.lost =
      false

    dispatchAnchorState(
      ar.presentedScene
        ?.element,
      'recovered',
    )

    updateArtVaultHint(
      ar.presentedScene
        ?.element,
      'Wall anchor recovered ✓ Position remains locked.',
    )
  }
}

function unlockRenderer(
  ar:
    InternalArRenderer,
  state:
    StableRendererState,
) {
  state.lockRequested =
    false

  state.anchorPending =
    false

  state.locked =
    false

  state.lost =
    false

  deleteAnchor(
    state,
  )

  ar.isTranslating =
    false

  ar.isRotating =
    false

  ar.isTwoHandInteraction =
    false

  restoreNativeRepositioning(
    ar,
    state,
  )

  dispatchAnchorState(
    ar.presentedScene
      ?.element,
    'unlocked',
  )

  updateArtVaultHint(
    ar.presentedScene
      ?.element,
    'Position unlocked. Drag the artwork to reposition it, then tap Lock position when you are satisfied.',
  )
}

function requestRendererLock(
  ar:
    InternalArRenderer,
  state:
    StableRendererState,
) {
  if (
    state.locked ||
    state.anchorPending
  ) {
    return
  }

  if (
    !state.session ||
    ar.currentSession !==
      state.session
  ) {
    return
  }

  state.lockRequested =
    true

  dispatchAnchorState(
    ar.presentedScene
      ?.element,
    'locking',
  )

  updateArtVaultHint(
    ar.presentedScene
      ?.element,
    'Lock requested. Holding the current artwork position…',
  )
}

function patchStableWallRenderer(
  ar:
    InternalArRenderer,
) {
  if (
    patchedRenderers.has(
      ar as object,
    )
  ) {
    return
  }

  patchedRenderers.add(
    ar as object,
  )

  const state:
    StableRendererState = {
      anchor:
        null,

      anchorPending:
        false,

      locked:
        false,

      nativeAnchor:
        false,

      lost:
        false,

      session:
        null,

      position: {
        x: 0,
        y: 0,
        z: 0,
      },

      yaw:
        0,

      lockRequested:
        false,
    }

  rendererStates.set(
    ar as object,
    state,
  )

  const originalResolve =
    ar.resolveARSession
      .bind(
        ar,
      )

  const originalFrame =
    ar.onWebXRFrame
      .bind(
        ar,
      )

  /*
   * Preserve model-viewer's WebXR
   * pipeline while requesting native
   * anchors as an optional feature.
   */
  ar.resolveARSession =
    async () => {
      const xr =
        navigator.xr

      if (
        !xr?.requestSession
      ) {
        return originalResolve()
      }

      const session =
        await xr.requestSession(
          'immersive-ar',
          {
            requiredFeatures:
              [],

            optionalFeatures: [
              'hit-test',
              'dom-overlay',
              'light-estimation',
              'anchors',
            ],

            domOverlay:
              ar.overlay
                ? {
                    root:
                      ar.overlay,
                  }
                : undefined,
          },
        )

      ar.threeRenderer
        .xr
        .setReferenceSpaceType(
          'local',
        )

      await ar.threeRenderer
        .xr
        .setSession(
          session,
        )

      ar.threeRenderer
        .xr
        .cameraAutoUpdate =
        false

      resetAnchorState(
        state,
      )

      state.session =
        session

      session.addEventListener(
        'end',
        () => {
          resetAnchorState(
            state,
          )
        },
        {
          once:
            true,
        },
      )

      return session
    }

  /*
   * There is deliberately NO
   * automatic wall anchoring here.
   *
   * model-viewer remains responsible
   * for normal wall placement and
   * touchscreen repositioning while
   * ArtVault is unlocked.
   */
  ar.onWebXRFrame =
    (
      time:
        number,
      frame:
        XRFrame,
    ) => {
      /*
       * Run model-viewer's original
       * frame first so the current
       * scenePivot contains the newest
       * placement after dragging.
       */
      originalFrame(
        time,
        frame,
      )

      /*
       * Create/freeze the anchor only
       * after an explicit user Lock
       * request.
       */
      if (
        state.lockRequested &&
        !state.locked &&
        !state.anchorPending
      ) {
        void createAnchorAtCurrentPlacement(
          ar,
          state,
          frame,
        )

        return
      }

      /*
       * Once locked, enforce the
       * stored/native anchor position
       * after model-viewer's own frame
       * processing.
       */
      if (
        state.locked
      ) {
        applyAnchorPose(
          ar,
          state,
          frame,
        )
      }
    }
}

function patchModelViewerPrototype(
  ModelViewerElementRuntime:
    typeof import(
      '@google/model-viewer'
    )['ModelViewerElement'],
  rendererSymbol:
    symbol,
) {
  const prototype =
    ModelViewerElementRuntime
      .prototype as
        ModelViewerElement & {
          activateAR():
            Promise<void>
        }

  if (
    patchedPrototypes.has(
      prototype as object,
    )
  ) {
    return
  }

  patchedPrototypes.add(
    prototype as object,
  )

  const originalActivateAR =
    prototype
      .activateAR

  prototype.activateAR =
    async function (
      this:
        ModelViewerElement,
    ) {
      const element =
        this

      const internal =
        (
          element as
            unknown as
            Record<
              symbol,
              InternalRenderer | undefined
            >
        )[
          rendererSymbol
        ]

      const ar =
        internal?.arRenderer

      if (ar) {
        patchStableWallRenderer(
          ar,
        )

        const state =
          rendererStates.get(
            ar as object,
          )

        if (state) {
          const eventElement =
            element as
              ModelViewerElement & {
                __artVaultAnchorControlsInstalled?:
                  boolean
              }

          if (
            !eventElement
              .__artVaultAnchorControlsInstalled
          ) {
            eventElement
              .__artVaultAnchorControlsInstalled =
              true

            element.addEventListener(
              'artvault-lock-position',
              () => {
                requestRendererLock(
                  ar,
                  state,
                )
              },
            )

            element.addEventListener(
              'artvault-unlock-position',
              () => {
                unlockRenderer(
                  ar,
                  state,
                )
              },
            )
          }
        }
      }

      return originalActivateAR
        .call(
          element,
        )
    }
}

/**
 * Pinned model-viewer 4.3.1
 * integration seam.
 *
 * ArtVault keeps model-viewer's
 * proven WebXR / Scene Viewer path.
 *
 * Wall placement remains movable
 * until the user explicitly requests
 * Lock position.
 */
export async function loadViewer() {
  const {
    ModelViewerElement,
  } =
    await import(
      '@google/model-viewer'
    )

  const {
    $renderer,
  } =
    await import(
      '@google/model-viewer/lib/model-viewer-base.js'
    )

  const {
    CachingGLTFLoader,
  } =
    await import(
      '@google/model-viewer/lib/three-components/CachingGLTFLoader.js'
    )

  ModelViewerElement
    .modelCacheSize =
    0

  patchModelViewerPrototype(
    ModelViewerElement,
    $renderer,
  )

  return {
    release(
      element:
        ModelViewerElement,
    ) {
      const internal =
        (
          element as
            unknown as
            Record<
              symbol,
              InternalRenderer | undefined
            >
        )[
          $renderer
        ]

      const renderer =
        internal?.arRenderer

      if (
        renderer &&
        renderer
          .presentedScene
          ?.element ===
        element
      ) {
        void renderer
          .stopPresenting()
          .catch(
            () =>
              undefined,
          )
      }

      /*
       * model-viewer 4.3.1 retains an
       * empty GLTF after a failed
       * fetch. Evict only that source
       * so Retry downloads it again.
       */
      if (
        !element.loaded &&
        element.src
      ) {
        void CachingGLTFLoader
          .delete(
            element.src,
          )
          .catch(
            () =>
              undefined,
          )
      }

      element.removeAttribute(
        'src',
      )

      element.remove()
    },
  }
}