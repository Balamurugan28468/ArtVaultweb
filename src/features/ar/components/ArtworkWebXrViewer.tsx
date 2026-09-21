import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type {
  PointerEvent as ReactPointerEvent,
} from 'react'
import * as THREE from 'three'
import {
  GLTFLoader,
} from 'three/addons/loaders/GLTFLoader.js'
import { Button } from '@/shared/ui'
import type { ArProof } from '../proof'
import {
  MAX_AR_SCALE,
  MIN_AR_SCALE,
  clampArScale,
  formatArCentimetres,
  scaleDisplaySize,
} from '../webxrMath'
import {
  ArtworkArViewer,
} from './ArtworkArViewer'

type ExperienceMode =
  | 'loading'
  | 'ready'
  | 'starting'
  | 'scanning'
  | 'locked'
  | 'adjusting'
  | 'error'

interface ArtworkWebXrViewerProps {
  proof: ArProof
  title: string
  poster?: string
}

interface WallTransform {
  position: THREE.Vector3
  quaternion: THREE.Quaternion
}

interface PointerPoint {
  x: number
  y: number
}

interface DragStart {
  pointerId: number
  x: number
  y: number
  offsetX: number
  offsetY: number
}

interface PinchStart {
  distance: number
  scale: number
}

const WORLD_UP =
  new THREE.Vector3(
    0,
    1,
    0,
  )

const WALL_NORMAL_AXIS =
  new THREE.Vector3(
    0,
    1,
    0,
  )

const WALL_VERTICAL_LIMIT =
  0.45

const WALL_OFFSET_METRES =
  0.008

const DRAG_METRES_PER_PIXEL =
  0.0015

function disposeObject(
  object: THREE.Object3D,
) {
  object.traverse(
    (entry) => {
      if (
        !(entry instanceof
          THREE.Mesh)
      ) {
        return
      }

      entry.geometry
        ?.dispose()

      const materials =
        Array.isArray(
          entry.material,
        )
          ? entry.material
          : [
              entry.material,
            ]

      for (
        const material
        of materials
      ) {
        if (!material) {
          continue
        }

        for (
          const value
          of Object.values(
            material,
          )
        ) {
          if (
            value instanceof
            THREE.Texture
          ) {
            value.dispose()
          }
        }

        material.dispose()
      }
    },
  )
}

function pointDistance(
  first: PointerPoint,
  second: PointerPoint,
): number {
  return Math.hypot(
    second.x -
      first.x,

    second.y -
      first.y,
  )
}

/**
 * Converts a WebXR wall hit into the coordinate system used by ArtVault's
 * generated GLB.
 *
 * WebXR may return no viewer pose for a frame. The viewer pose is therefore
 * deliberately optional here.
 */
function wallTransformFromPose(
  pose: XRPose,
  viewerPose:
    | XRViewerPose
    | null
    | undefined,
): WallTransform | null {
  const position =
    new THREE.Vector3(
      pose.transform
        .position.x,

      pose.transform
        .position.y,

      pose.transform
        .position.z,
    )

  const orientation =
    pose.transform
      .orientation

  const hitQuaternion =
    new THREE.Quaternion(
      orientation.x,
      orientation.y,
      orientation.z,
      orientation.w,
    )

  const normal =
    WALL_NORMAL_AXIS
      .clone()
      .applyQuaternion(
        hitQuaternion,
      )
      .normalize()

  const verticalAmount =
    Math.abs(
      normal.dot(
        WORLD_UP,
      ),
    )

  if (
    verticalAmount >
    WALL_VERTICAL_LIMIT
  ) {
    return null
  }

  if (viewerPose) {
    const viewerPosition =
      new THREE.Vector3(
        viewerPose
          .transform
          .position.x,

        viewerPose
          .transform
          .position.y,

        viewerPose
          .transform
          .position.z,
      )

    const towardViewer =
      viewerPosition
        .sub(
          position,
        )
        .normalize()

    if (
      normal.dot(
        towardViewer,
      ) < 0
    ) {
      normal.negate()
    }
  }

  const right =
    new THREE.Vector3()
      .crossVectors(
        WORLD_UP,
        normal,
      )

  if (
    right.lengthSq() <
    0.000001
  ) {
    return null
  }

  right.normalize()

  const correctedUp =
    new THREE.Vector3()
      .crossVectors(
        normal,
        right,
      )
      .normalize()

  const rotationMatrix =
    new THREE.Matrix4()
      .makeBasis(
        right,
        correctedUp,
        normal,
      )

  const quaternion =
    new THREE.Quaternion()
      .setFromRotationMatrix(
        rotationMatrix,
      )

  return {
    position,
    quaternion,
  }
}

export function ArtworkWebXrViewer({
  proof,
  title,
  poster,
}: ArtworkWebXrViewerProps) {
  const canvasHostRef =
    useRef<HTMLDivElement>(
      null,
    )

  const overlayRootRef =
    useRef<HTMLDivElement>(
      null,
    )

  const rendererRef =
    useRef<THREE.WebGLRenderer | null>(
      null,
    )

  const sceneRef =
    useRef<THREE.Scene | null>(
      null,
    )

  const cameraRef =
    useRef<THREE.PerspectiveCamera | null>(
      null,
    )

  const reticleRef =
    useRef<THREE.Mesh | null>(
      null,
    )

  const anchorGroupRef =
    useRef<THREE.Group | null>(
      null,
    )

  const adjustmentGroupRef =
    useRef<THREE.Group | null>(
      null,
    )

  const loadedModelRef =
    useRef<THREE.Object3D | null>(
      null,
    )

  const sessionRef =
    useRef<XRSession | null>(
      null,
    )

  const referenceSpaceRef =
    useRef<XRReferenceSpace | null>(
      null,
    )

  const hitTestSourceRef =
    useRef<XRHitTestSource | null>(
      null,
    )

  const anchorRef =
    useRef<XRAnchor | null>(
      null,
    )

  const latestHitRef =
    useRef<XRHitTestResult | null>(
      null,
    )

  const latestWallTransformRef =
    useRef<WallTransform | null>(
      null,
    )

  const placedRef =
    useRef(false)

  const modelReadyRef =
    useRef(false)

  const mountedRef =
    useRef(true)

  const wallReadyRef =
    useRef(false)

  const trackingLostRef =
    useRef(false)

  const modeRef =
    useRef<ExperienceMode>(
      'loading',
    )

  const scaleRef =
    useRef(1)

  const offsetXRef =
    useRef(0)

  const offsetYRef =
    useRef(0)

  const pointersRef =
    useRef<
      Map<
        number,
        PointerPoint
      >
    >(
      new Map(),
    )

  const dragStartRef =
    useRef<DragStart | null>(
      null,
    )

  const pinchStartRef =
    useRef<PinchStart | null>(
      null,
    )

  const [
    webXrSupported,
    setWebXrSupported,
  ] =
    useState<
      boolean | null
    >(null)

  const [
    modelReady,
    setModelReady,
  ] =
    useState(false)

  const [
    presenting,
    setPresenting,
  ] =
    useState(false)

  const [
    mode,
    setMode,
  ] =
    useState<ExperienceMode>(
      'loading',
    )

  const [
    wallReady,
    setWallReady,
  ] =
    useState(false)

  const [
    trackingLost,
    setTrackingLost,
  ] =
    useState(false)

  const [
    anchored,
    setAnchored,
  ] =
    useState(false)

  const [
    scale,
    setScale,
  ] =
    useState(1)

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(null)

  const [
    useFallback,
    setUseFallback,
  ] =
    useState(false)

  const size =
    useMemo(
      () =>
        scaleDisplaySize(
          proof.widthMm,
          proof.heightMm,
          scale,
        ),
      [
        proof.widthMm,
        proof.heightMm,
        scale,
      ],
    )

  const scaleProgress =
    useMemo(
      () =>
        (
          (
            scale -
            MIN_AR_SCALE
          ) /
          (
            MAX_AR_SCALE -
            MIN_AR_SCALE
          )
        ) * 100,
      [
        scale,
      ],
    )

  const setExperienceMode =
    (
      next:
        ExperienceMode,
    ) => {
      modeRef.current =
        next

      if (
        mountedRef.current
      ) {
        setMode(next)
      }
    }

  const updateWallReady =
    (
      next: boolean,
    ) => {
      if (
        wallReadyRef.current ===
        next
      ) {
        return
      }

      wallReadyRef.current =
        next

      if (
        mountedRef.current
      ) {
        setWallReady(
          next,
        )
      }
    }

  const updateTrackingLost =
    (
      next: boolean,
    ) => {
      if (
        trackingLostRef.current ===
        next
      ) {
        return
      }

      trackingLostRef.current =
        next

      if (
        mountedRef.current
      ) {
        setTrackingLost(
          next,
        )
      }
    }

  const removeAnchor =
    () => {
      const anchor =
        anchorRef.current

      anchorRef.current =
        null

      if (!anchor) {
        return
      }

      try {
        const deletable =
          anchor as XRAnchor & {
            delete?: () =>
              void
          }

        deletable.delete?.()
      } catch {
        // Best-effort anchor cleanup.
      }
    }

  const applyAdjustment =
    () => {
      const group =
        adjustmentGroupRef
          .current

      if (!group) {
        return
      }

      group.position.set(
        offsetXRef.current,
        offsetYRef.current,
        WALL_OFFSET_METRES,
      )

      group.scale.setScalar(
        scaleRef.current,
      )
    }

  const clearPointers =
    () => {
      pointersRef.current
        .clear()

      dragStartRef.current =
        null

      pinchStartRef.current =
        null
    }

  const resetAdjustment =
    () => {
      scaleRef.current =
        1

      offsetXRef.current =
        0

      offsetYRef.current =
        0

      if (
        mountedRef.current
      ) {
        setScale(1)
      }

      clearPointers()
      applyAdjustment()
    }

  const updateScale =
    (
      requested:
        number,
    ) => {
      const next =
        clampArScale(
          requested,
        )

      scaleRef.current =
        next

      if (
        mountedRef.current
      ) {
        setScale(next)
      }

      applyAdjustment()
    }

  const finishSessionState =
    () => {
      const renderer =
        rendererRef.current

      renderer
        ?.setAnimationLoop(
          null,
        )

      try {
        hitTestSourceRef
          .current
          ?.cancel()
      } catch {
        // Session may already be ending.
      }

      hitTestSourceRef.current =
        null

      referenceSpaceRef.current =
        null

      latestHitRef.current =
        null

      latestWallTransformRef.current =
        null

      removeAnchor()

      sessionRef.current =
        null

      placedRef.current =
        false

      const reticle =
        reticleRef.current

      if (reticle) {
        reticle.visible =
          false
      }

      const anchorGroup =
        anchorGroupRef
          .current

      if (anchorGroup) {
        anchorGroup.visible =
          false
      }

      resetAdjustment()

      updateWallReady(
        false,
      )

      updateTrackingLost(
        false,
      )

      if (
        mountedRef.current
      ) {
        setPresenting(
          false,
        )

        setAnchored(
          false,
        )

        setExperienceMode(
          modelReadyRef.current
            ? 'ready'
            : 'loading',
        )
      }
    }

  useEffect(
    () => {
      mountedRef.current =
        true

      return () => {
        mountedRef.current =
          false
      }
    },
    [],
  )

  useEffect(
    () => {
      let active =
        true

      const xr =
        navigator.xr

      if (!xr) {
        setWebXrSupported(
          false,
        )

        return () => {
          active =
            false
        }
      }

      void xr
        .isSessionSupported(
          'immersive-ar',
        )
        .then(
          (supported) => {
            if (active) {
              setWebXrSupported(
                supported,
              )
            }
          },
        )
        .catch(
          () => {
            if (active) {
              setWebXrSupported(
                false,
              )
            }
          },
        )

      return () => {
        active =
          false
      }
    },
    [],
  )

  useEffect(
    () => {
      const overlay =
        overlayRootRef
          .current

      if (!overlay) {
        return
      }

      const suppressWorldSelect =
        (
          event: Event,
        ) => {
          event.preventDefault()
        }

      overlay.addEventListener(
        'beforexrselect',
        suppressWorldSelect,
      )

      return () => {
        overlay.removeEventListener(
          'beforexrselect',
          suppressWorldSelect,
        )
      }
    },
    [],
  )

  useEffect(
    () => {
      let disposed =
        false

      modelReadyRef.current =
        false

      setModelReady(
        false,
      )

      setError(
        null,
      )

      setExperienceMode(
        'loading',
      )

      const scene =
        new THREE.Scene()

      sceneRef.current =
        scene

      const camera =
        new THREE.PerspectiveCamera(
          60,
          1,
          0.01,
          20,
        )

      cameraRef.current =
        camera

      const renderer =
        new THREE.WebGLRenderer({
          alpha: true,
          antialias: true,
          powerPreference:
            'high-performance',
        })

      rendererRef.current =
        renderer

      renderer.xr.enabled =
        true

      renderer.xr
        .setReferenceSpaceType(
          'local',
        )

      renderer.setPixelRatio(
        Math.min(
          window
            .devicePixelRatio ||
            1,
          2,
        ),
      )

      renderer.setSize(
        Math.max(
          window.innerWidth,
          1,
        ),
        Math.max(
          window.innerHeight,
          1,
        ),
        false,
      )

      renderer.setClearColor(
        0x000000,
        0,
      )

      renderer.outputColorSpace =
        THREE.SRGBColorSpace

      renderer.domElement
        .setAttribute(
          'aria-hidden',
          'true',
        )

      renderer.domElement
        .style.position =
        'absolute'

      renderer.domElement
        .style.width =
        '1px'

      renderer.domElement
        .style.height =
        '1px'

      renderer.domElement
        .style.opacity =
        '0'

      renderer.domElement
        .style.pointerEvents =
        'none'

      canvasHostRef.current
        ?.append(
          renderer.domElement,
        )

      scene.add(
        new THREE
          .HemisphereLight(
            0xffffff,
            0x444444,
            2.2,
          ),
      )

      const anchorGroup =
        new THREE.Group()

      anchorGroup.visible =
        false

      anchorGroupRef.current =
        anchorGroup

      const adjustmentGroup =
        new THREE.Group()

      adjustmentGroupRef.current =
        adjustmentGroup

      anchorGroup.add(
        adjustmentGroup,
      )

      scene.add(
        anchorGroup,
      )

      const reticleGeometry =
        new THREE.RingGeometry(
          0.055,
          0.072,
          64,
        )

      const reticleMaterial =
        new THREE
          .MeshBasicMaterial({
            color:
              0x00eaff,

            side:
              THREE.DoubleSide,

            transparent:
              true,

            opacity:
              0.95,

            depthTest:
              false,
          })

      const reticle =
        new THREE.Mesh(
          reticleGeometry,
          reticleMaterial,
        )

      reticle.visible =
        false

      reticle.renderOrder =
        1000

      reticleRef.current =
        reticle

      scene.add(
        reticle,
      )

      const loader =
        new GLTFLoader()

      void loader
        .loadAsync(
          proof.modelUrl,
        )
        .then(
          (gltf) => {
            if (disposed) {
              disposeObject(
                gltf.scene,
              )

              return
            }

            loadedModelRef.current =
              gltf.scene

            adjustmentGroup.add(
              gltf.scene,
            )

            resetAdjustment()

            modelReadyRef.current =
              true

            setModelReady(
              true,
            )

            setExperienceMode(
              'ready',
            )
          },
        )
        .catch(
          () => {
            if (disposed) {
              return
            }

            modelReadyRef.current =
              false

            setModelReady(
              false,
            )

            setError(
              'The ArtVault AR model could not be loaded.',
            )

            setExperienceMode(
              'error',
            )
          },
        )

      return () => {
        disposed =
          true

        const session =
          sessionRef.current

        if (session) {
          void session
            .end()
            .catch(
              () =>
                undefined,
            )
        }

        renderer
          .setAnimationLoop(
            null,
          )

        const model =
          loadedModelRef
            .current

        if (model) {
          disposeObject(
            model,
          )
        }

        loadedModelRef.current =
          null

        reticleGeometry
          .dispose()

        reticleMaterial
          .dispose()

        renderer.dispose()

        renderer
          .domElement
          .remove()

        rendererRef.current =
          null

        sceneRef.current =
          null

        cameraRef.current =
          null

        reticleRef.current =
          null

        anchorGroupRef.current =
          null

        adjustmentGroupRef.current =
          null
      }
    },
    [
      proof.modelUrl,
    ],
  )

  const renderXrFrame =
    (
      frame: XRFrame,
    ) => {
      const renderer =
        rendererRef.current

      const scene =
        sceneRef.current

      const camera =
        cameraRef.current

      const referenceSpace =
        referenceSpaceRef
          .current

      const hitSource =
        hitTestSourceRef
          .current

      const reticle =
        reticleRef.current

      const anchorGroup =
        anchorGroupRef
          .current

      if (
        !renderer ||
        !scene ||
        !camera ||
        !referenceSpace
      ) {
        return
      }

      const viewerPose =
        frame.getViewerPose(
          referenceSpace,
        )

      if (
        placedRef.current
      ) {
        if (reticle) {
          reticle.visible =
            false
        }

        const anchor =
          anchorRef.current

        if (
          anchor &&
          anchorGroup
        ) {
          const anchorPose =
            frame.getPose(
              anchor.anchorSpace,
              referenceSpace,
            )

          if (anchorPose) {
            const wall =
              wallTransformFromPose(
                anchorPose,
                viewerPose,
              )

            if (wall) {
              anchorGroup
                .position
                .copy(
                  wall.position,
                )

              anchorGroup
                .quaternion
                .copy(
                  wall.quaternion,
                )

              updateTrackingLost(
                false,
              )
            } else {
              updateTrackingLost(
                true,
              )
            }
          } else {
            updateTrackingLost(
              true,
            )
          }
        } else {
          updateTrackingLost(
            !viewerPose,
          )
        }
      } else if (
        hitSource &&
        reticle
      ) {
        const hits =
          frame.getHitTestResults(
            hitSource,
          )

        const hit =
          hits[0]

        if (hit) {
          const hitPose =
            hit.getPose(
              referenceSpace,
            )

          if (hitPose) {
            const wall =
              wallTransformFromPose(
                hitPose,
                viewerPose,
              )

            if (wall) {
              latestHitRef.current =
                hit

              latestWallTransformRef.current =
                wall

              reticle.visible =
                true

              reticle
                .position
                .copy(
                  wall.position,
                )

              reticle
                .quaternion
                .copy(
                  wall.quaternion,
                )

              reticle
                .translateZ(
                  0.003,
                )

              updateWallReady(
                true,
              )
            } else {
              reticle.visible =
                false

              latestHitRef.current =
                null

              latestWallTransformRef.current =
                null

              updateWallReady(
                false,
              )
            }
          }
        } else {
          reticle.visible =
            false

          latestHitRef.current =
            null

          latestWallTransformRef.current =
            null

          updateWallReady(
            false,
          )
        }
      }

      renderer.render(
        scene,
        camera,
      )
    }

  const startAr =
    async () => {
      const xr =
        navigator.xr

      if (
        !modelReady ||
        !xr ||
        !overlayRootRef.current ||
        !rendererRef.current
      ) {
        return
      }

      if (
        sessionRef.current
      ) {
        return
      }

      setError(null)

      setExperienceMode(
        'starting',
      )

      let session:
        XRSession | null =
          null

      try {
        session =
          await xr
            .requestSession(
              'immersive-ar',
              {
                requiredFeatures: [
                  'hit-test',
                  'dom-overlay',
                ],

                optionalFeatures: [
                  'anchors',
                ],

                domOverlay: {
                  root:
                    overlayRootRef
                      .current,
                },
              },
            )

        sessionRef.current =
          session

        const requestHitTestSource =
          session.requestHitTestSource

        if (
          typeof requestHitTestSource !==
          'function'
        ) {
          throw new Error(
            'WebXR hit testing is unavailable.',
          )
        }

        const endHandler =
          () => {
            finishSessionState()
          }

        session.addEventListener(
          'end',
          endHandler,
          {
            once: true,
          },
        )

        const renderer =
          rendererRef.current

        await renderer.xr
          .setSession(
            session,
          )

        const [
          referenceSpace,
          viewerSpace,
        ] =
          await Promise.all([
            session
              .requestReferenceSpace(
                'local',
              ),

            session
              .requestReferenceSpace(
                'viewer',
              ),
          ])

        const hitSource =
          await requestHitTestSource
            .call(
              session,
              {
                space:
                  viewerSpace,
              },
            )

        if (!hitSource) {
          throw new Error(
            'WebXR hit testing is unavailable.',
          )
        }

        referenceSpaceRef.current =
          referenceSpace

        hitTestSourceRef.current =
          hitSource

        resetAdjustment()

        placedRef.current =
          false

        updateWallReady(
          false,
        )

        updateTrackingLost(
          false,
        )

        setAnchored(
          false,
        )

        setPresenting(
          true,
        )

        setExperienceMode(
          'scanning',
        )

        renderer
          .setAnimationLoop(
            (
              _time,
              frame,
            ) => {
              if (frame) {
                renderXrFrame(
                  frame,
                )
              }
            },
          )
      } catch {
        if (
          session &&
          sessionRef.current ===
            session
        ) {
          try {
            await session
              .end()
          } catch {
            // Ignore cleanup failure.
          }
        }

        sessionRef.current =
          null

        setError(
          'ArtVault AR 2.0 could not start. WebXR hit-test and DOM-overlay support are required.',
        )

        setExperienceMode(
          'error',
        )
      }
    }

  const endAr =
    () => {
      const session =
        sessionRef.current

      if (!session) {
        return
      }

      void session
        .end()
        .catch(
          () =>
            finishSessionState(),
        )
    }

  const placeArtwork =
    async () => {
      if (
        modeRef.current !==
          'scanning'
      ) {
        return
      }

      const transform =
        latestWallTransformRef
          .current

      const hit =
        latestHitRef.current

      const anchorGroup =
        anchorGroupRef
          .current

      if (
        !transform ||
        !anchorGroup
      ) {
        return
      }

      resetAdjustment()

      anchorGroup
        .position
        .copy(
          transform.position,
        )

      anchorGroup
        .quaternion
        .copy(
          transform.quaternion,
        )

      anchorGroup.visible =
        true

      placedRef.current =
        true

      const reticle =
        reticleRef.current

      if (reticle) {
        reticle.visible =
          false
      }

      latestWallTransformRef.current =
        null

      updateWallReady(
        false,
      )

      setAnchored(
        false,
      )

      setExperienceMode(
        'locked',
      )

      if (!hit) {
        return
      }

      const anchorCapableHit =
        hit as XRHitTestResult & {
          createAnchor?: () =>
            Promise<XRAnchor>
        }

      if (
        typeof anchorCapableHit
          .createAnchor !==
        'function'
      ) {
        return
      }

      const currentSession =
        sessionRef.current

      try {
        const anchor =
          await anchorCapableHit
            .createAnchor()

        if (
          !placedRef.current ||
          sessionRef.current !==
            currentSession
        ) {
          const disposable =
            anchor as XRAnchor & {
              delete?: () =>
                void
            }

          disposable.delete?.()

          return
        }

        removeAnchor()

        anchorRef.current =
          anchor

        if (
          mountedRef.current
        ) {
          setAnchored(
            true,
          )
        }
      } catch {
        // Anchor support is optional.
        // The local reference-space pose remains locked.
      }
    }

  const resetPlacement =
    () => {
      removeAnchor()

      setAnchored(
        false,
      )

      placedRef.current =
        false

      resetAdjustment()

      const anchorGroup =
        anchorGroupRef
          .current

      if (anchorGroup) {
        anchorGroup.visible =
          false
      }

      updateTrackingLost(
        false,
      )

      updateWallReady(
        false,
      )

      setExperienceMode(
        'scanning',
      )
    }

  const enterAdjustMode =
    () => {
      if (
        !placedRef.current
      ) {
        return
      }

      clearPointers()

      setExperienceMode(
        'adjusting',
      )
    }

  const finishAdjustMode =
    () => {
      clearPointers()

      setExperienceMode(
        'locked',
      )
    }

  const pointerDown =
    (
      event:
        ReactPointerEvent<
          HTMLDivElement
        >,
    ) => {
      if (
        modeRef.current !==
          'adjusting'
      ) {
        return
      }

      event.preventDefault()

      event.currentTarget
        .setPointerCapture(
          event.pointerId,
        )

      pointersRef.current
        .set(
          event.pointerId,
          {
            x:
              event.clientX,

            y:
              event.clientY,
          },
        )

      const points = [
        ...pointersRef
          .current
          .entries(),
      ]

      if (
        points.length ===
        1
      ) {
        const [
          pointerId,
          point,
        ] =
          points[0]

        dragStartRef.current =
          {
            pointerId,

            x:
              point.x,

            y:
              point.y,

            offsetX:
              offsetXRef
                .current,

            offsetY:
              offsetYRef
                .current,
          }

        pinchStartRef.current =
          null
      } else if (
        points.length >= 2
      ) {
        const first =
          points[0][1]

        const second =
          points[1][1]

        pinchStartRef.current =
          {
            distance:
              Math.max(
                1,
                pointDistance(
                  first,
                  second,
                ),
              ),

            scale:
              scaleRef
                .current,
          }

        dragStartRef.current =
          null
      }
    }

  const pointerMove =
    (
      event:
        ReactPointerEvent<
          HTMLDivElement
        >,
    ) => {
      if (
        modeRef.current !==
          'adjusting'
      ) {
        return
      }

      if (
        !pointersRef.current
          .has(
            event.pointerId,
          )
      ) {
        return
      }

      event.preventDefault()

      pointersRef.current
        .set(
          event.pointerId,
          {
            x:
              event.clientX,

            y:
              event.clientY,
          },
        )

      const points = [
        ...pointersRef
          .current
          .entries(),
      ]

      if (
        points.length >= 2 &&
        pinchStartRef.current
      ) {
        const first =
          points[0][1]

        const second =
          points[1][1]

        const distance =
          pointDistance(
            first,
            second,
          )

        const start =
          pinchStartRef.current

        updateScale(
          start.scale *
            (
              distance /
              start.distance
            ),
        )

        return
      }

      if (
        points.length === 1 &&
        dragStartRef.current
      ) {
        const [
          pointerId,
          point,
        ] =
          points[0]

        const start =
          dragStartRef.current

        if (
          pointerId !==
          start.pointerId
        ) {
          return
        }

        const deltaX =
          point.x -
          start.x

        const deltaY =
          point.y -
          start.y

        offsetXRef.current =
          Math.max(
            -2,
            Math.min(
              2,
              start.offsetX +
                deltaX *
                  DRAG_METRES_PER_PIXEL,
            ),
          )

        offsetYRef.current =
          Math.max(
            -1.5,
            Math.min(
              1.5,
              start.offsetY -
                deltaY *
                  DRAG_METRES_PER_PIXEL,
            ),
          )

        applyAdjustment()
      }
    }

  const pointerFinished =
    (
      event:
        ReactPointerEvent<
          HTMLDivElement
        >,
    ) => {
      pointersRef.current
        .delete(
          event.pointerId,
        )

      pinchStartRef.current =
        null

      const remaining = [
        ...pointersRef
          .current
          .entries(),
      ]

      if (
        remaining.length ===
        1
      ) {
        const [
          pointerId,
          point,
        ] =
          remaining[0]

        dragStartRef.current =
          {
            pointerId,

            x:
              point.x,

            y:
              point.y,

            offsetX:
              offsetXRef
                .current,

            offsetY:
              offsetYRef
                .current,
          }
      } else {
        dragStartRef.current =
          null
      }
    }

  if (
    useFallback ||
    webXrSupported ===
      false
  ) {
    return (
      <ArtworkArViewer
        proof={proof}
        title={title}
        poster={poster}
      />
    )
  }

  return (
    <section
      className="flex min-w-0 flex-col gap-4"
      aria-label="ArtVault AR 2.0"
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-400">
          ArtVault XR
        </p>

        <h2 className="font-display text-xl">
          View Art in Your Space
        </h2>
      </div>

      <p className="text-sm text-text-secondary">
        Estimated starting
        display size:{' '}
        {formatArCentimetres(
          proof.widthMm /
            10,
        )}{' '}
        ×{' '}
        {formatArCentimetres(
          proof.heightMm /
            10,
        )}{' '}
        cm including the frame.
      </p>

      <p className="text-xs text-text-muted">
        This is an estimated
        visualization size, not a
        verified measurement of the
        physical artwork. You can
        intentionally resize it
        after placement.
      </p>

      {poster && (
        <div className="overflow-hidden rounded-xl border border-border bg-black/20">
          <img
            src={poster}
            alt={`${title} - AR artwork preview`}
            className="max-h-80 w-full object-contain"
          />
        </div>
      )}

      <div
        ref={canvasHostRef}
        className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0"
        aria-hidden="true"
      />

      {webXrSupported ===
        null && (
        <p role="status">
          Checking immersive AR
          support...
        </p>
      )}

      {!modelReady &&
        mode !==
          'error' && (
          <p role="status">
            Preparing ArtVault AR
            model...
          </p>
        )}

      {error && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-xl border border-border p-4"
        >
          <p>
            {error}
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="info"
              onClick={
                startAr
              }
              disabled={
                !modelReady
              }
            >
              Retry AR 2.0
            </Button>

            <Button
              onClick={() =>
                setUseFallback(
                  true,
                )
              }
            >
              Use compatibility AR
            </Button>
          </div>
        </div>
      )}

      {modelReady &&
        webXrSupported &&
        !presenting && (
          <Button
            variant="info"
            onClick={
              startAr
            }
            disabled={
              mode ===
              'starting'
            }
          >
            {mode ===
            'starting'
              ? 'Starting AR...'
              : 'Launch ArtVault AR 2.0'}
          </Button>
        )}

      <div
        ref={overlayRootRef}
        aria-hidden={
          !presenting
        }
        className="fixed inset-0 z-[9999] overflow-hidden text-white"
        style={{
          opacity:
            presenting
              ? 1
              : 0,

          pointerEvents:
            presenting
              ? 'auto'
              : 'none',

          touchAction:
            'none',

          background:
            'transparent',
        }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(to bottom, rgba(2,6,23,0.58) 0%, transparent 24%, transparent 62%, rgba(2,6,23,0.76) 100%)',
          }}
        />

        <header className="absolute left-0 right-0 top-0 z-30 flex items-center justify-between p-4">
          <div className="rounded-xl border border-cyan-300/30 bg-black/55 px-4 py-3 backdrop-blur-md">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-cyan-300">
              ArtVault XR
            </p>

            <p className="max-w-[13rem] truncate text-sm font-semibold">
              {title}
            </p>
          </div>

          <button
            type="button"
            onClick={
              endAr
            }
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-black/60 text-xl backdrop-blur-md"
            aria-label="Exit AR"
          >
            ×
          </button>
        </header>

        {mode ===
          'adjusting' && (
          <div
            className="absolute inset-0 z-10"
            style={{
              touchAction:
                'none',
            }}
            onPointerDown={
              pointerDown
            }
            onPointerMove={
              pointerMove
            }
            onPointerUp={
              pointerFinished
            }
            onPointerCancel={
              pointerFinished
            }
          />
        )}

        {mode ===
          'scanning' && (
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 text-center">
            <div
              className={`mx-auto flex h-24 w-24 items-center justify-center rounded-full border ${
                wallReady
                  ? 'border-cyan-300 bg-cyan-400/10'
                  : 'border-white/40 bg-black/10'
              }`}
            >
              <div
                className={`h-3 w-3 rounded-full ${
                  wallReady
                    ? 'bg-cyan-300'
                    : 'bg-white/60'
                }`}
              />
            </div>

            <p className="mt-4 rounded-full bg-black/55 px-4 py-2 text-xs font-semibold tracking-wide backdrop-blur-md">
              {wallReady
                ? 'WALL DETECTED'
                : 'SCAN FOR A WALL'}
            </p>
          </div>
        )}

        {trackingLost && (
          <div
            role="alert"
            className="absolute left-4 right-4 top-24 z-30 rounded-xl border border-amber-300/50 bg-black/70 p-3 text-center text-sm backdrop-blur-md"
          >
            Tracking temporarily
            lost. Hold the phone
            steady and point it back
            toward the wall.
          </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 z-30 p-4">
          <div className="mx-auto flex max-w-md flex-col gap-3 rounded-2xl border border-white/15 bg-slate-950/75 p-4 shadow-2xl backdrop-blur-xl">
            {mode ===
              'scanning' && (
              <>
                <div className="text-center">
                  <p className="text-sm font-semibold">
                    {wallReady
                      ? 'Wall ready'
                      : 'Move your phone slowly'}
                  </p>

                  <p className="mt-1 text-xs text-white/65">
                    Point the centre
                    reticle at a
                    vertical wall.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={
                    !wallReady
                  }
                  onClick={
                    placeArtwork
                  }
                  className="rounded-xl bg-cyan-300 px-5 py-3 font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  Tap to Place
                </button>
              </>
            )}

            {(mode ===
              'locked' ||
              mode ===
                'adjusting') && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-white/55">
                      Estimated Size
                    </p>

                    <p className="mt-1 text-lg font-bold text-cyan-200">
                      {formatArCentimetres(
                        size.widthCm,
                      )}{' '}
                      ×{' '}
                      {formatArCentimetres(
                        size.heightCm,
                      )}{' '}
                      cm
                    </p>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-white/55">
                      Scale
                    </p>

                    <p className="mt-1 text-lg font-bold text-cyan-200">
                      {size.scalePercent}%
                    </p>
                  </div>
                </div>

                <div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-cyan-300"
                      style={{
                        width:
                          `${scaleProgress}%`,
                      }}
                    />
                  </div>

                  <div className="mt-1 flex justify-between text-[10px] text-white/45">
                    <span>
                      {Math.round(
                        MIN_AR_SCALE *
                          100,
                      )}
                      %
                    </span>

                    <span>
                      {Math.round(
                        MAX_AR_SCALE *
                          100,
                      )}
                      %
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span
                    className={
                      anchored
                        ? 'text-emerald-300'
                        : 'text-white/60'
                    }
                  >
                    {anchored
                      ? '● AR anchor active'
                      : '● Stable local placement'}
                  </span>

                  <span className="text-white/55">
                    {mode ===
                    'adjusting'
                      ? 'Drag + pinch'
                      : 'Placement locked'}
                  </span>
                </div>

                {mode ===
                  'locked' ? (
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={
                        enterAdjustMode
                      }
                      className="rounded-xl bg-cyan-300 px-3 py-3 font-bold text-slate-950"
                    >
                      Adjust
                    </button>

                    <button
                      type="button"
                      onClick={
                        resetPlacement
                      }
                      className="rounded-xl border border-white/20 bg-white/10 px-3 py-3 font-semibold"
                    >
                      Reset
                    </button>

                    <button
                      type="button"
                      onClick={
                        endAr
                      }
                      className="rounded-xl border border-emerald-300/40 bg-emerald-300/15 px-3 py-3 font-semibold text-emerald-200"
                    >
                      Finish
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="text-center text-xs text-white/65">
                      One finger:
                      reposition on the
                      wall. Two fingers:
                      resize.
                    </p>

                    <button
                      type="button"
                      onClick={
                        finishAdjustMode
                      }
                      className="rounded-xl bg-cyan-300 px-5 py-3 font-bold text-slate-950"
                    >
                      Done — Lock Placement
                    </button>
                  </>
                )}
              </>
            )}

            {mode ===
              'starting' && (
              <p className="text-center text-sm">
                Starting immersive
                AR...
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}