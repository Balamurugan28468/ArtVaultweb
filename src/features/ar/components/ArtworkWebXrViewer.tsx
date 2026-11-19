import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { Artwork } from '@/features/artwork'
import { Button } from '@/shared/ui'
import {
  artworkArDimensionsDefault,
  artworkArDimensionsFromAspect,
  artworkArDimensionsFromProof,
  detectImageAspect,
  MESH_FIT_FACTOR,
  type ArtworkArDimensions,
} from '../artworkArDimensions'
import type { ArProof } from '../proof'
import {
  MAX_AR_SCALE,
  MIN_AR_SCALE,
  clampArScale,
  formatArCentimetres,
  scaleDisplaySize,
} from '../webxrMath'
import { ArtworkArViewer } from './ArtworkArViewer'

type ExperienceMode =
  | 'loading'
  | 'ready'
  | 'starting'
  | 'scanning'
  | 'adjusting'
  | 'locked'
  | 'error'

interface ArtworkWebXrViewerProps {
  artwork?: Artwork
  proof?: ArProof | null
  title?: string
  poster?: string
  onExit?: () => void
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

const WORLD_UP = new THREE.Vector3(0, 1, 0)
const WALL_NORMAL_AXIS = new THREE.Vector3(0, 1, 0)
const WALL_VERTICAL_LIMIT = 0.62
const WALL_OFFSET_METRES = 0.008
const DRAG_METRES_PER_PIXEL = 0.0015
const STALE_HIT_GRACE_FRAMES = 8

// Module-level reusable scratch objects to avoid GC churn in per-frame XR loops
const _scratchPosition = new THREE.Vector3()
const _scratchHitQuaternion = new THREE.Quaternion()
const _scratchNormal = new THREE.Vector3()
const _scratchTowardViewer = new THREE.Vector3()
const _scratchRight = new THREE.Vector3()
const _scratchCorrectedUp = new THREE.Vector3()
const _scratchRotationMatrix = new THREE.Matrix4()

function disposeObject(object: THREE.Object3D) {
  object.traverse((entry) => {
    if (!(entry instanceof THREE.Mesh)) return
    entry.geometry?.dispose()

    const materials = Array.isArray(entry.material)
      ? entry.material
      : [entry.material]

    for (const material of materials) {
      if (!material) continue

      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) value.dispose()
      }

      material.dispose()
    }
  })
}

function pointDistance(first: PointerPoint, second: PointerPoint): number {
  return Math.hypot(second.x - first.x, second.y - first.y)
}

/**
 * Convert a WebXR vertical-wall hit into ArtVault's model coordinates.
 * A viewer pose may be unavailable on individual frames.
 */
function wallTransformFromPose(
  pose: XRPose,
  viewerPose: XRViewerPose | null | undefined,
): WallTransform | null {
  _scratchPosition.set(
    pose.transform.position.x,
    pose.transform.position.y,
    pose.transform.position.z,
  )
  const orientation = pose.transform.orientation
  _scratchHitQuaternion.set(
    orientation.x,
    orientation.y,
    orientation.z,
    orientation.w,
  )
  _scratchNormal
    .copy(WALL_NORMAL_AXIS)
    .applyQuaternion(_scratchHitQuaternion)
    .normalize()

  if (Math.abs(_scratchNormal.dot(WORLD_UP)) > WALL_VERTICAL_LIMIT) return null

  if (viewerPose) {
    _scratchTowardViewer
      .set(
        viewerPose.transform.position.x,
        viewerPose.transform.position.y,
        viewerPose.transform.position.z,
      )
      .sub(_scratchPosition)
      .normalize()

    if (_scratchNormal.dot(_scratchTowardViewer) < 0) _scratchNormal.negate()
  }

  _scratchRight.crossVectors(WORLD_UP, _scratchNormal)
  if (_scratchRight.lengthSq() < 0.000001) return null
  _scratchRight.normalize()

  _scratchCorrectedUp
    .crossVectors(_scratchNormal, _scratchRight)
    .normalize()
  _scratchRotationMatrix.makeBasis(
    _scratchRight,
    _scratchCorrectedUp,
    _scratchNormal,
  )

  return {
    position: _scratchPosition.clone(),
    quaternion: new THREE.Quaternion().setFromRotationMatrix(_scratchRotationMatrix),
  }
}

export function ArtworkWebXrViewer({
  artwork,
  proof,
  title = artwork?.title || 'Artwork',
  poster = artwork?.images[0]?.url,
  onExit,
}: ArtworkWebXrViewerProps) {
  const canvasHostRef = useRef<HTMLDivElement>(null)
  const overlayRootRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const reticleRef = useRef<THREE.Mesh | null>(null)
  const anchorGroupRef = useRef<THREE.Group | null>(null)
  const adjustmentGroupRef = useRef<THREE.Group | null>(null)
  const loadedModelRef = useRef<THREE.Object3D | null>(null)
  const sessionRef = useRef<XRSession | null>(null)
  const referenceSpaceRef = useRef<XRReferenceSpace | null>(null)
  const hitTestSourceRef = useRef<XRHitTestSource | null>(null)
  const anchorRef = useRef<XRAnchor | null>(null)
  const latestHitRef = useRef<XRHitTestResult | null>(null)
  const latestWallTransformRef = useRef<WallTransform | null>(null)
  const placedRef = useRef(false)
  const placementGenerationRef = useRef(0)
  const modelReadyRef = useRef(false)
  const mountedRef = useRef(true)
  const wallReadyRef = useRef(false)
  const trackingLostRef = useRef(false)
  const modeRef = useRef<ExperienceMode>('loading')
  const scaleRef = useRef(1)
  const rotationDegRef = useRef(0)
  const offsetXRef = useRef(0)
  const offsetYRef = useRef(0)
  const pointersRef = useRef<Map<number, PointerPoint>>(new Map())
  const dragStartRef = useRef<DragStart | null>(null)
  const pinchStartRef = useRef<PinchStart | null>(null)
  const staleHitFramesRef = useRef(0)

  const [webXrSupported, setWebXrSupported] = useState<boolean | null>(null)
  const [modelReady, setModelReady] = useState(false)
  const [presenting, setPresenting] = useState(false)
  const [mode, setMode] = useState<ExperienceMode>('loading')
  const [wallReady, setWallReady] = useState(false)
  const [trackingLost, setTrackingLost] = useState(false)
  const [anchored, setAnchored] = useState(false)
  const [scale, setScale] = useState(1)
  const [rotationDeg, setRotationDeg] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [useFallback, setUseFallback] = useState(false)

  const imageUrl = poster || artwork?.images[0]?.url

  const [dimensions, setDimensions] = useState<ArtworkArDimensions>(() => {
    if (proof) return artworkArDimensionsFromProof(proof)
    return artworkArDimensionsDefault()
  })

  // Detect image aspect ratio when no proof is supplied
  useEffect(() => {
    if (proof) {
      setDimensions(artworkArDimensionsFromProof(proof))
      return
    }
    if (!imageUrl) {
      setDimensions(artworkArDimensionsDefault())
      return
    }
    let active = true
    void detectImageAspect(imageUrl).then((aspect) => {
      if (!active) return
      if (aspect) {
        setDimensions(artworkArDimensionsFromAspect(aspect))
      }
    })
    return () => {
      active = false
    }
  }, [proof, imageUrl])

  const widthMm = dimensions.widthMm
  const heightMm = dimensions.heightMm

  const size = useMemo(
    () => scaleDisplaySize(widthMm, heightMm, scale),
    [widthMm, heightMm, scale],
  )

  const scaleProgress = useMemo(
    () => ((scale - MIN_AR_SCALE) / (MAX_AR_SCALE - MIN_AR_SCALE)) * 100,
    [scale],
  )

  const setExperienceMode = (next: ExperienceMode) => {
    modeRef.current = next
    if (mountedRef.current) setMode(next)
  }

  const updateWallReady = (next: boolean) => {
    if (wallReadyRef.current === next) return
    wallReadyRef.current = next
    if (mountedRef.current) setWallReady(next)
  }

  const updateTrackingLost = (next: boolean) => {
    if (trackingLostRef.current === next) return
    trackingLostRef.current = next
    if (mountedRef.current) setTrackingLost(next)
  }

  const removeAnchor = () => {
    const anchor = anchorRef.current
    anchorRef.current = null
    if (!anchor) return

    try {
      const deletable = anchor as XRAnchor & { delete?: () => void }
      deletable.delete?.()
    } catch {
      // Some devices may have already destroyed the anchor.
    }
  }

  const applyAdjustment = () => {
    const group = adjustmentGroupRef.current
    if (!group) return

    group.position.set(
      offsetXRef.current,
      offsetYRef.current,
      WALL_OFFSET_METRES,
    )
    group.scale.setScalar(scaleRef.current)
    group.rotation.z = THREE.MathUtils.degToRad(rotationDegRef.current)
  }

  const clearPointers = () => {
    pointersRef.current.clear()
    dragStartRef.current = null
    pinchStartRef.current = null
  }

  const resetAdjustment = () => {
    scaleRef.current = 1
    rotationDegRef.current = 0
    offsetXRef.current = 0
    offsetYRef.current = 0
    if (mountedRef.current) {
      setScale(1)
      setRotationDeg(0)
    }
    clearPointers()
    applyAdjustment()
  }

  const updateScale = (requested: number) => {
    const next = clampArScale(requested)
    scaleRef.current = next
    if (mountedRef.current) setScale(next)
    applyAdjustment()
  }

  const rotateArtwork = (deltaDegrees: number) => {
    const next = (rotationDegRef.current + deltaDegrees + 360) % 360
    rotationDegRef.current = next
    if (mountedRef.current) setRotationDeg(next)
    applyAdjustment()
  }

  const finishSessionState = () => {
    placementGenerationRef.current += 1
    rendererRef.current?.setAnimationLoop(null)

    try {
      hitTestSourceRef.current?.cancel()
    } catch {
      // The session may already have ended.
    }

    hitTestSourceRef.current = null
    staleHitFramesRef.current = 0
    referenceSpaceRef.current = null
    latestHitRef.current = null
    latestWallTransformRef.current = null
    removeAnchor()
    sessionRef.current = null
    placedRef.current = false

    if (reticleRef.current) reticleRef.current.visible = false
    if (anchorGroupRef.current) anchorGroupRef.current.visible = false

    resetAdjustment()
    updateWallReady(false)
    updateTrackingLost(false)

    if (mountedRef.current) {
      setPresenting(false)
      setAnchored(false)
      setExperienceMode(modelReadyRef.current ? 'ready' : 'loading')
      onExit?.()
    }
  }

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    let active = true
    const xr = navigator.xr

    if (!xr) {
      setWebXrSupported(false)
      return () => {
        active = false
      }
    }

    void xr.isSessionSupported('immersive-ar').then(
      (supported) => {
        if (active) setWebXrSupported(supported)
      },
      () => {
        if (active) setWebXrSupported(false)
      },
    )

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const overlay = overlayRootRef.current
    if (!overlay) return

    const suppressWorldSelect = (event: Event) => event.preventDefault()
    overlay.addEventListener('beforexrselect', suppressWorldSelect)

    return () => {
      overlay.removeEventListener('beforexrselect', suppressWorldSelect)
    }
  }, [])

  useEffect(() => {
    let disposed = false
    modelReadyRef.current = false
    setModelReady(false)
    setError(null)
    setExperienceMode('loading')

    const scene = new THREE.Scene()
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(60, 1, 0.01, 20)
    cameraRef.current = camera

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      })
    } catch {
      setError('WebGL is not supported in this browser environment.')
      setExperienceMode('error')
      return
    }
    rendererRef.current = renderer
    renderer.xr.enabled = true
    renderer.xr.setReferenceSpaceType('local')
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setSize(
      Math.max(window.innerWidth, 1),
      Math.max(window.innerHeight, 1),
      false,
    )
    renderer.setClearColor(0x000000, 0)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.domElement.setAttribute('aria-hidden', 'true')
    Object.assign(renderer.domElement.style, {
      position: 'absolute',
      width: '1px',
      height: '1px',
      opacity: '0',
      pointerEvents: 'none',
    })
    canvasHostRef.current?.append(renderer.domElement)

    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2.2))

    const anchorGroup = new THREE.Group()
    anchorGroup.visible = false
    anchorGroupRef.current = anchorGroup

    const adjustmentGroup = new THREE.Group()
    adjustmentGroupRef.current = adjustmentGroup
    anchorGroup.add(adjustmentGroup)
    scene.add(anchorGroup)

    const reticleGeometry = new THREE.RingGeometry(0.055, 0.072, 64)
    const reticleMaterial = new THREE.MeshBasicMaterial({
      color: 0x00eaff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
    })
    const reticle = new THREE.Mesh(reticleGeometry, reticleMaterial)
    reticle.visible = false
    reticle.renderOrder = 1000
    reticleRef.current = reticle
    scene.add(reticle)

    const createDirectMesh = (url: string) => {
      const artGroup = new THREE.Group()
      const wM = (dimensions.artworkWidthMm / 1000) * MESH_FIT_FACTOR
      const hM = (dimensions.artworkHeightMm / 1000) * MESH_FIT_FACTOR
      const frameBorderM = ((dimensions.frameMm * 2) / 1000) * MESH_FIT_FACTOR
      const frameGeo = new THREE.BoxGeometry(wM + frameBorderM, hM + frameBorderM, 0.03)
      const frameMat = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a,
        roughness: 0.4,
      })
      const frameMesh = new THREE.Mesh(frameGeo, frameMat)
      artGroup.add(frameMesh)

      const canvasGeo = new THREE.PlaneGeometry(wM, hM)
      const placeholderMat = new THREE.MeshStandardMaterial({ color: 0x2d3748 })
      const canvasMesh: THREE.Mesh = new THREE.Mesh(canvasGeo, placeholderMat)
      canvasMesh.position.z = 0.016
      artGroup.add(canvasMesh)

      // Add to scene immediately and mark ready so artwork is placed without delay
      loadedModelRef.current = artGroup
      adjustmentGroup.add(artGroup)
      resetAdjustment()
      modelReadyRef.current = true
      setModelReady(true)
      setExperienceMode('ready')

      // Load texture and replace placeholder material when ready
      const textureLoader = new THREE.TextureLoader()
      textureLoader.load(
        url,
        (texture) => {
          if (disposed) {
            texture.dispose()
            return
          }
          texture.colorSpace = THREE.SRGBColorSpace
          placeholderMat.dispose()
          canvasMesh.material = new THREE.MeshBasicMaterial({ map: texture })
        },
        undefined,
        () => {
          // Keep placeholder mesh on error
        },
      )
    }

    if (proof?.modelUrl) {
      const loader = new GLTFLoader()
      void loader.loadAsync(proof.modelUrl).then(
        (gltf) => {
          if (disposed) {
            disposeObject(gltf.scene)
            return
          }

          loadedModelRef.current = gltf.scene
          adjustmentGroup.add(gltf.scene)
          resetAdjustment()
          modelReadyRef.current = true
          setModelReady(true)
          setExperienceMode('ready')
        },
        () => {
          if (disposed) return
          if (imageUrl) {
            createDirectMesh(imageUrl)
          } else {
            modelReadyRef.current = false
            setModelReady(false)
            setError('The ArtVault AR model could not be loaded.')
            setExperienceMode('error')
          }
        },
      )
    } else if (imageUrl) {
      createDirectMesh(imageUrl)
    } else {
      modelReadyRef.current = false
      setModelReady(false)
      setError('The ArtVault AR model could not be loaded.')
      setExperienceMode('error')
    }

    return () => {
      disposed = true
      placementGenerationRef.current += 1

      const session = sessionRef.current
      if (session) void session.end().catch(() => undefined)
      renderer.setAnimationLoop(null)

      if (loadedModelRef.current) disposeObject(loadedModelRef.current)
      loadedModelRef.current = null
      reticleGeometry.dispose()
      reticleMaterial.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      rendererRef.current = null
      sceneRef.current = null
      cameraRef.current = null
      reticleRef.current = null
      anchorGroupRef.current = null
      adjustmentGroupRef.current = null
    }
  }, [
    proof?.modelUrl,
    imageUrl,
    dimensions.artworkWidthMm,
    dimensions.artworkHeightMm,
    dimensions.frameMm,
  ])

  const renderXrFrame = (frame: XRFrame) => {
    const renderer = rendererRef.current
    const scene = sceneRef.current
    const camera = cameraRef.current
    const referenceSpace = referenceSpaceRef.current
    const hitSource = hitTestSourceRef.current
    const reticle = reticleRef.current
    const anchorGroup = anchorGroupRef.current

    if (!renderer || !scene || !camera || !referenceSpace) return

    const viewerPose = frame.getViewerPose(referenceSpace)

    if (placedRef.current) {
      if (reticle) reticle.visible = false
      const anchor = anchorRef.current

      if (anchor && anchorGroup) {
        const anchorPose = frame.getPose(anchor.anchorSpace, referenceSpace)
        if (anchorPose) {
          const wall = wallTransformFromPose(anchorPose, viewerPose)
          if (wall) {
            anchorGroup.position.copy(wall.position)
            anchorGroup.quaternion.copy(wall.quaternion)
            updateTrackingLost(false)
          } else {
            updateTrackingLost(true)
          }
        } else {
          updateTrackingLost(true)
        }
      } else {
        updateTrackingLost(!viewerPose)
      }
    } else if (hitSource && reticle) {
      const hits = frame.getHitTestResults(hitSource)
      const hit = hits[0]
      let validWall: WallTransform | null = null

      if (hit) {
        const hitPose = hit.getPose(referenceSpace)
        if (hitPose) {
          validWall = wallTransformFromPose(hitPose, viewerPose)
        }
      }

      if (hit && validWall) {
        staleHitFramesRef.current = 0
        latestHitRef.current = hit
        latestWallTransformRef.current = validWall
        reticle.visible = true
        reticle.position.copy(validWall.position)
        reticle.quaternion.copy(validWall.quaternion)
        reticle.translateZ(0.003)
        updateWallReady(true)
      } else {
        staleHitFramesRef.current += 1
        if (staleHitFramesRef.current > STALE_HIT_GRACE_FRAMES) {
          reticle.visible = false
          latestHitRef.current = null
          latestWallTransformRef.current = null
          updateWallReady(false)
        }
      }
    }

    renderer.render(scene, camera)
  }

  const startAr = async () => {
    const xr = navigator.xr
    if (
      !modelReady ||
      !xr ||
      !overlayRootRef.current ||
      !rendererRef.current ||
      sessionRef.current
    ) {
      return
    }

    setError(null)
    setExperienceMode('starting')
    let session: XRSession | null = null

    try {
      session = await xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay', 'anchors', 'local-floor'],
        domOverlay: overlayRootRef.current ? { root: overlayRootRef.current } : undefined,
      })
      sessionRef.current = session

      const requestHitTestSource = session.requestHitTestSource
      if (typeof requestHitTestSource !== 'function') {
        throw new Error('WebXR hit testing is unavailable.')
      }

      session.addEventListener('end', finishSessionState, { once: true })

      const renderer = rendererRef.current
      await renderer.xr.setSession(session)

      const [referenceSpace, viewerSpace] = await Promise.all([
        session.requestReferenceSpace('local'),
        session.requestReferenceSpace('viewer'),
      ])

      const hitSource = await requestHitTestSource.call(session, {
        space: viewerSpace,
      })

      if (!hitSource) throw new Error('WebXR hit testing is unavailable.')

      referenceSpaceRef.current = referenceSpace
      hitTestSourceRef.current = hitSource
      placementGenerationRef.current += 1
      resetAdjustment()
      placedRef.current = false
      updateWallReady(false)
      updateTrackingLost(false)
      setAnchored(false)
      staleHitFramesRef.current = 0
      setPresenting(true)
      setExperienceMode('scanning')

      renderer.setAnimationLoop((_time, frame) => {
        if (frame) renderXrFrame(frame)
      })
    } catch (cause: unknown) {
      if (session && sessionRef.current === session) {
        try {
          await session.end()
        } catch {
          // Ignore cleanup errors.
        }
      }

      finishSessionState()
      if (mountedRef.current) {
        const name = cause instanceof DOMException ? cause.name : ''
        const errorMessage = name === 'NotAllowedError'
          ? 'Camera/AR permission was denied. Please allow camera permissions in your browser settings and try again.'
          : name === 'SecurityError'
            ? 'Camera AR requires a secure connection (HTTPS). Please access ArtVault over HTTPS or localhost.'
            : name === 'NotSupportedError'
              ? 'WebXR immersive AR with hit-test is not supported on this device. You can use the 3D gallery preview instead.'
              : 'ArtVault AR could not start. Please ensure WebXR and camera permissions are available, or use the 3D gallery preview.'
        setError(errorMessage)
        setExperienceMode('error')
      }
    }
  }

  const endAr = () => {
    const session = sessionRef.current
    if (!session) return
    void session.end().catch(finishSessionState)
  }

  const placeArtwork = async () => {
    if (modeRef.current !== 'scanning') return

    const transform = latestWallTransformRef.current
    const hit = latestHitRef.current
    const anchorGroup = anchorGroupRef.current
    if (!transform || !anchorGroup) return

    const placementGeneration = ++placementGenerationRef.current
    resetAdjustment()
    anchorGroup.position.copy(transform.position)
    anchorGroup.quaternion.copy(transform.quaternion)
    anchorGroup.visible = true
    placedRef.current = true

    if (reticleRef.current) reticleRef.current.visible = false
    latestHitRef.current = null
    latestWallTransformRef.current = null
    updateWallReady(false)
    setAnchored(false)

    // IMPORTANT: A new placement is editable until the user presses Lock.
    // An AR anchor stabilizes tracking; it is NOT the editing lock.
    setExperienceMode('adjusting')

    if (!hit) return

    const anchorCapableHit = hit as XRHitTestResult & {
      createAnchor?: () => Promise<XRAnchor>
    }
    if (typeof anchorCapableHit.createAnchor !== 'function') return

    const currentSession = sessionRef.current

    try {
      const anchor = await anchorCapableHit.createAnchor()
      if (
        !placedRef.current ||
        sessionRef.current !== currentSession ||
        placementGenerationRef.current !== placementGeneration
      ) {
        const disposable = anchor as XRAnchor & { delete?: () => void }
        disposable.delete?.()
        return
      }

      removeAnchor()
      anchorRef.current = anchor
      if (mountedRef.current) setAnchored(true)
    } catch {
      // Spatial anchoring is optional; local placement remains editable.
    }
  }

  const resetPlacement = () => {
    placementGenerationRef.current += 1
    removeAnchor()
    setAnchored(false)
    placedRef.current = false
    resetAdjustment()
    latestHitRef.current = null
    latestWallTransformRef.current = null
    if (anchorGroupRef.current) anchorGroupRef.current.visible = false
    updateTrackingLost(false)
    updateWallReady(false)
    setExperienceMode('scanning')
  }

  const unlockPosition = () => {
    if (!placedRef.current || modeRef.current !== 'locked') return
    clearPointers()
    setExperienceMode('adjusting')
  }

  const lockPosition = () => {
    if (!placedRef.current || modeRef.current !== 'adjusting') return
    clearPointers()
    setExperienceMode('locked')
  }

  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (modeRef.current !== 'adjusting' || !placedRef.current) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    })

    const points = [...pointersRef.current.entries()]
    if (points.length === 1) {
      const [pointerId, point] = points[0]
      dragStartRef.current = {
        pointerId,
        x: point.x,
        y: point.y,
        offsetX: offsetXRef.current,
        offsetY: offsetYRef.current,
      }
      pinchStartRef.current = null
    } else if (points.length >= 2) {
      pinchStartRef.current = {
        distance: Math.max(1, pointDistance(points[0][1], points[1][1])),
        scale: scaleRef.current,
      }
      dragStartRef.current = null
    }
  }

  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (modeRef.current !== 'adjusting') return
    if (!pointersRef.current.has(event.pointerId)) return
    event.preventDefault()

    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    })
    const points = [...pointersRef.current.entries()]

    if (points.length >= 2 && pinchStartRef.current) {
      const distance = pointDistance(points[0][1], points[1][1])
      updateScale(
        pinchStartRef.current.scale *
          (distance / pinchStartRef.current.distance),
      )
      return
    }

    if (points.length === 1 && dragStartRef.current) {
      const [pointerId, point] = points[0]
      const start = dragStartRef.current
      if (pointerId !== start.pointerId) return

      offsetXRef.current = Math.max(
        -2,
        Math.min(
          2,
          start.offsetX + (point.x - start.x) * DRAG_METRES_PER_PIXEL,
        ),
      )
      offsetYRef.current = Math.max(
        -1.5,
        Math.min(
          1.5,
          start.offsetY - (point.y - start.y) * DRAG_METRES_PER_PIXEL,
        ),
      )
      applyAdjustment()
    }
  }

  const pointerFinished = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId)
    pinchStartRef.current = null
    const remaining = [...pointersRef.current.entries()]

    if (remaining.length === 1) {
      const [pointerId, point] = remaining[0]
      dragStartRef.current = {
        pointerId,
        x: point.x,
        y: point.y,
        offsetX: offsetXRef.current,
        offsetY: offsetYRef.current,
      }
    } else {
      dragStartRef.current = null
    }
  }

  if (useFallback || webXrSupported === false) {
    if (onExit) {
      onExit()
      return null
    }
    if (proof) {
      return <ArtworkArViewer proof={proof} title={title} poster={poster} />
    }
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
        <h2 className="font-display text-xl">View Art in Your Space</h2>
      </div>

      <p className="text-sm text-text-secondary">
        Estimated starting display size:{' '}
        {formatArCentimetres(widthMm / 10)} ×{' '}
        {formatArCentimetres(heightMm / 10)} cm including the frame.
      </p>

      <p className="text-xs text-text-muted">
        This is an estimated visualization size, not a verified measurement of
        the physical artwork. You can intentionally resize it after placement.
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

      {webXrSupported === null && (
        <p role="status">Checking immersive AR support...</p>
      )}
      {!modelReady && mode !== 'error' && (
        <p role="status">Preparing ArtVault AR model...</p>
      )}

      {error && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-xl border border-border p-4"
        >
          <p>{error}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="info" onClick={startAr} disabled={!modelReady}>
              Retry Immersive AR
            </Button>
            <Button onClick={() => setUseFallback(true)}>
              Use 3D Gallery Preview
            </Button>
          </div>
        </div>
      )}

      {modelReady && webXrSupported && !presenting && (
        <Button
          variant="info"
          onClick={startAr}
          disabled={mode === 'starting'}
        >
          {mode === 'starting' ? 'Starting AR...' : 'Launch ArtVault AR 2.0'}
        </Button>
      )}

      <div
        ref={overlayRootRef}
        aria-hidden={!presenting}
        className="fixed inset-0 z-[9999] overflow-hidden text-white"
        style={{
          opacity: presenting ? 1 : 0,
          pointerEvents: presenting ? 'auto' : 'none',
          touchAction: 'none',
          background: 'transparent',
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
            onClick={endAr}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-black/60 text-xl backdrop-blur-md"
            aria-label="Exit AR"
          >
            ×
          </button>
        </header>

        {mode === 'adjusting' && (
          <div
            className="absolute inset-0 z-10"
            style={{ touchAction: 'none' }}
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerFinished}
            onPointerCancel={pointerFinished}
            aria-label="Drag to reposition or pinch to resize the artwork"
          />
        )}

        {mode === 'scanning' && (
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
                  wallReady ? 'bg-cyan-300' : 'bg-white/60'
                }`}
              />
            </div>
            <p className="mt-4 rounded-full bg-black/55 px-4 py-2 text-xs font-semibold tracking-wide backdrop-blur-md">
              {wallReady ? 'WALL DETECTED' : 'SCAN FOR A WALL'}
            </p>
          </div>
        )}

        {trackingLost && (
          <div
            role="alert"
            className="absolute left-4 right-4 top-24 z-30 rounded-xl border border-amber-300/50 bg-black/70 p-3 text-center text-sm backdrop-blur-md"
          >
            Tracking temporarily lost. Hold the phone steady and point it back
            toward the wall.
          </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 z-30 p-3 pb-safe">
          <div className="mx-auto flex max-w-md flex-col gap-2 rounded-2xl border border-white/10 bg-black/40 p-3 shadow-2xl backdrop-blur-xl">
            {mode === 'scanning' && (
              <>
                <div className="text-center">
                  <p className="text-sm font-semibold">
                    {wallReady ? 'Wall ready' : 'Move your phone slowly'}
                  </p>
                  <p className="mt-0.5 text-[11px] text-white/60">
                    Point the centre reticle at a vertical wall.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!wallReady}
                  onClick={placeArtwork}
                  className="rounded-xl bg-cyan-300 px-5 py-2.5 font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  Tap to Place
                </button>
              </>
            )}

            {(mode === 'locked' || mode === 'adjusting') && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                    <p className="text-[9px] uppercase tracking-wider text-white/50">
                      Estimated Size
                    </p>
                    <p className="mt-0.5 text-sm font-bold text-cyan-200">
                      {formatArCentimetres(size.widthCm)} ×{' '}
                      {formatArCentimetres(size.heightCm)} cm
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                    <p className="text-[9px] uppercase tracking-wider text-white/50">
                      Scale
                    </p>
                    <p className="mt-0.5 text-sm font-bold text-cyan-200">
                      {size.scalePercent}%
                    </p>
                  </div>
                </div>

                <div>
                  <div className="h-1 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-cyan-300"
                      style={{ width: `${scaleProgress}%` }}
                    />
                  </div>
                  <div className="mt-0.5 flex justify-between text-[9px] text-white/40">
                    <span>{Math.round(MIN_AR_SCALE * 100)}%</span>
                    <span>{Math.round(MAX_AR_SCALE * 100)}%</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span
                    className={
                      anchored ? 'text-emerald-300' : 'text-white/55'
                    }
                  >
                    {anchored
                      ? '● AR anchor active'
                      : '● Stable local placement'}
                  </span>
                  <span
                    className={
                      mode === 'locked'
                        ? 'font-semibold text-emerald-300'
                        : 'font-semibold text-cyan-200'
                    }
                    role="status"
                  >
                    {mode === 'locked'
                      ? '🔒 Position locked'
                      : '🔓 Position unlocked'}
                  </span>
                </div>

                {mode === 'locked' ? (
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={unlockPosition}
                      className="rounded-xl bg-cyan-300 px-2 py-2.5 text-sm font-bold text-slate-950"
                      aria-label="Unlock artwork position"
                    >
                      🔓 Unlock
                    </button>
                    <button
                      type="button"
                      onClick={resetPlacement}
                      className="rounded-xl border border-white/20 bg-white/10 px-2 py-2.5 text-sm font-semibold"
                    >
                      Reset
                    </button>
                    <button
                      type="button"
                      onClick={endAr}
                      className="rounded-xl border border-emerald-300/40 bg-emerald-300/15 px-2 py-2.5 text-sm font-semibold text-emerald-200"
                    >
                      Finish
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="text-center text-[11px] text-white/60">
                      Drag to reposition. Pinch to resize. Rotate buttons adjust angle.
                    </p>
                    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] text-white/80">
                      <span>Rotation: {rotationDeg}°</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => rotateArtwork(-15)}
                          className="rounded-lg border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] font-semibold hover:bg-white/20"
                          aria-label="Rotate counter-clockwise 15 degrees"
                        >
                          ↺ -15°
                        </button>
                        <button
                          type="button"
                          onClick={() => rotateArtwork(15)}
                          className="rounded-lg border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] font-semibold hover:bg-white/20"
                          aria-label="Rotate clockwise 15 degrees"
                        >
                          ↻ +15°
                        </button>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={lockPosition}
                      className="rounded-xl bg-cyan-300 px-5 py-2.5 font-bold text-slate-950 text-sm"
                      aria-label="Lock artwork position"
                    >
                      🔒 Lock position
                    </button>
                    <button
                      type="button"
                      onClick={resetPlacement}
                      className="rounded-xl border border-white/20 bg-white/10 px-5 py-1.5 text-sm font-semibold"
                    >
                      Reset placement
                    </button>
                  </>
                )}
              </>
            )}

            {mode === 'starting' && (
              <p className="text-center text-sm">Starting immersive AR...</p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
