import type {
  ModelViewerElement,
} from '@google/model-viewer'

type AnchorLockStatus =
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

interface AnchorCapableHit
  extends XRHitTestResult {
  createAnchor?():
    Promise<XRAnchor>
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

  nativeAnchor:
    boolean

  locked:
    boolean

  lost:
    boolean

  position: {
    x: number
    y: number
    z: number
  }

  yaw:
    number

  session:
    XRSession | null
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
  message: string,
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
    // Session may already have ended.
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
}

function isValidWallPose(
  pose:
    XRPose,
): boolean {
  const matrix =
    pose.transform
      .matrix

  /*
   * This deliberately mirrors
   * model-viewer 4.3.1's wall
   * hit-test rule.
   *
   * For floor placement it accepts
   * a normal with Y > .75.
   *
   * For wall placement it accepts
   * the opposite case.
   */
  return (
    matrix[5] <=
    0.75
  )
}

function wallYawFromPose(
  pose:
    XRPose,
): number {
  const matrix =
    pose.transform
      .matrix

  /*
   * Same wall-yaw calculation used
   * by model-viewer 4.3.1.
   */
  return Math.atan2(
    matrix[4],
    matrix[6],
  )
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

function softwareLockFromPose(
  ar:
    InternalArRenderer,
  state:
    StableRendererState,
  pose:
    XRPose,
) {
  const position =
    pose.transform
      .position

  const yaw =
    wallYawFromPose(
      pose,
    )

  state.locked =
    true

  state.nativeAnchor =
    false

  lockRendererToPosition(
    ar,
    state,
    position.x,
    position.y,
    position.z,
    yaw,
  )

  disableNativeRepositioning(
    ar,
  )

  dispatchAnchorState(
    ar.presentedScene
      ?.element,
    'local-lock',
  )

  updateArtVaultHint(
    ar.presentedScene
      ?.element,
    'Wall position locked. Native XR anchoring is unavailable, so ArtVault is using its fixed local placement fallback.',
  )
}

async function createBestAnchor(
  ar:
    InternalArRenderer,
  state:
    StableRendererState,
  frame:
    XRFrame,
  hit:
    AnchorCapableHit,
  hitPose:
    XRPose,
) {
  if (
    state.anchorPending ||
    state.anchor ||
    state.locked
  ) {
    return
  }

  state.anchorPending =
    true

  const position =
    hitPose.transform
      .position

  const yaw =
    wallYawFromPose(
      hitPose,
    )

  /*
   * Lock the visual position
   * immediately. We do not wait
   * for the asynchronous native
   * anchor to finish materialising.
   */
  lockRendererToPosition(
    ar,
    state,
    position.x,
    position.y,
    position.z,
    yaw,
  )

  dispatchAnchorState(
    ar.presentedScene
      ?.element,
    'locking',
  )

  updateArtVaultHint(
    ar.presentedScene
      ?.element,
    'Wall detected. Locking artwork to this physical position…',
  )

  let anchor:
    XRAnchor | null =
      null

  let usedHitAnchor =
    false

  try {
    /*
     * Best option:
     *
     * anchor directly from the
     * wall hit. The WebXR Anchors
     * specification allows this
     * anchor to remain associated
     * with the real-world entity
     * that produced the hit.
     */
    if (
      typeof hit
        .createAnchor ===
        'function'
    ) {
      anchor =
        await hit
          .createAnchor()

      usedHitAnchor =
        true
    } else {
      /*
       * Second-best native option:
       *
       * create a free anchor at the
       * wall hit position.
       */
      const referenceSpace =
        ar.threeRenderer
          .xr
          .getReferenceSpace()

      const anchorFrame =
        frame as
          AnchorCapableFrame

      if (
        referenceSpace &&
        typeof anchorFrame
          .createAnchor ===
          'function'
      ) {
        const transform =
          new XRRigidTransform(
            {
              x:
                position.x,

              y:
                position.y,

              z:
                position.z,
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
      }
    }
  } catch {
    anchor =
      null
  }

  state.anchorPending =
    false

  /*
   * The AR session may have ended
   * while anchor creation was
   * pending.
   */
  if (
    !state.session ||
    ar.currentSession !==
      state.session
  ) {
    try {
      anchor?.delete()
    } catch {
      // Ignore stale-session cleanup.
    }

    return
  }

  if (!anchor) {
    softwareLockFromPose(
      ar,
      state,
      hitPose,
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

  /*
   * Store the original yaw.
   * A free anchor has identity
   * orientation, while a hit-test
   * anchor contains wall-oriented
   * axes.
   */
  state.yaw =
    yaw

  ;(
    state as
      StableRendererState & {
        hitOrientedAnchor?:
          boolean
      }
  ).hitOrientedAnchor =
    usedHitAnchor

  disableNativeRepositioning(
    ar,
  )

  const initial =
    ar.initialHitSource

  if (initial) {
    try {
      initial.cancel()
    } catch {
      // Already cancelled by model-viewer.
    }
  }

  ar.initialHitSource =
    null

  dispatchAnchorState(
    ar.presentedScene
      ?.element,
    'anchored',
  )

  updateArtVaultHint(
    ar.presentedScene
      ?.element,
    'Position locked to wall ✓ Move the phone to inspect the artwork. Size controls remain available.',
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
     * Local fallback.
     *
     * This blocks accidental
     * repositioning, but cannot
     * correct an ARCore world-map
     * relocalisation the way a
     * native anchor can.
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
        'Anchor tracking temporarily lost. Keep the phone pointed at the wall and nearby edges until tracking recovers.',
      )
    }

    /*
     * Do not choose another wall
     * hit or move the artwork to a
     * new position.
     */
    return
  }

  const position =
    pose.transform
      .position

  const hitOriented =
    (
      state as
        StableRendererState & {
          hitOrientedAnchor?:
            boolean
        }
    ).hitOrientedAnchor ===
      true

  const yaw =
    hitOriented
      ? wallYawFromPose(
          pose,
        )
      : state.yaw

  lockRendererToPosition(
    ar,
    state,
    position.x,
    position.y,
    position.z,
    yaw,
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

function findWallHit(
  ar:
    InternalArRenderer,
  frame:
    XRFrame,
): {
  hit:
    AnchorCapableHit

  pose:
    XRPose
} | null {
  if (
    !ar.placeOnWall
  ) {
    return null
  }

  const source =
    ar.initialHitSource

  const referenceSpace =
    ar.threeRenderer
      .xr
      .getReferenceSpace()

  if (
    !source ||
    !referenceSpace
  ) {
    return null
  }

  let hits:
    XRHitTestResult[]

  try {
    hits =
      frame.getHitTestResults(
        source,
      )
  } catch {
    return null
  }

  for (
    const candidate
    of hits
  ) {
    const pose =
      candidate.getPose(
        referenceSpace,
      )

    if (
      !pose ||
      !isValidWallPose(
        pose,
      )
    ) {
      continue
    }

    return {
      hit:
        candidate as
          AnchorCapableHit,

      pose,
    }
  }

  return null
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

      nativeAnchor:
        false,

      locked:
        false,

      lost:
        false,

      position: {
        x: 0,
        y: 0,
        z: 0,
      },

      yaw:
        0,

      session:
        null,
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
   * Keep model-viewer's existing
   * WebXR session architecture.
   *
   * The only session-level change
   * is requesting "anchors" as an
   * optional feature.
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
   * Add native wall anchoring while
   * preserving model-viewer's own
   * rendering, hit testing, frame
   * styling, DOM overlay and size
   * controls.
   */
  ar.onWebXRFrame =
    (
      time:
        number,
      frame:
        XRFrame,
    ) => {
      /*
       * Acquire the first valid
       * vertical-wall hit before
       * model-viewer consumes and
       * cancels its initial hit
       * source.
       */
      if (
        !state.locked &&
        !state.anchorPending
      ) {
        const wallHit =
          findWallHit(
            ar,
            frame,
          )

        if (
          wallHit
        ) {
          /*
           * Calling the async
           * function starts
           * createAnchor() while
           * this XRFrame is still
           * active.
           */
          void createBestAnchor(
            ar,
            state,
            frame,
            wallHit.hit,
            wallHit.pose,
          )
      }
      }

      /*
       * Once locked, push the
       * anchor pose into the same
       * scenePivot and goal values
       * model-viewer already uses.
       *
       * This avoids replacing its
       * renderer or creating a
       * second AR engine.
       */
      applyAnchorPose(
        ar,
        state,
        frame,
      )

      originalFrame(
        time,
        frame,
      )
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
      const internal =
        (
          this as
            unknown as
            Record<
              symbol,
              InternalRenderer
            >
        )[
          rendererSymbol
        ]

      if (
        internal?.arRenderer
      ) {
        patchStableWallRenderer(
          internal
            .arRenderer,
        )
      }

      return originalActivateAR
        .call(
          this,
        )
    }
}

/**
 * Pinned model-viewer 4.3.1
 * integration seam.
 *
 * ArtVault keeps model-viewer's
 * working WebXR / Scene Viewer
 * pipeline, but augments WebXR
 * with optional native anchors for
 * more stable wall placement.
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
      const renderer =
        (
          element as
            unknown as
            Record<
              symbol,
              InternalRenderer
            >
        )[
          $renderer
        ]
          .arRenderer

      if (
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
       * 4.3.1 retains an empty GLTF
       * after a failed fetch.
       * Evict that source only so a
       * retry actually downloads it.
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