import {
  Camera,
  ChevronDown,
  ChevronUp,
  Eye,
  Info,
  Lock,
  RefreshCw,
  RotateCw,
  Sliders,
  Smartphone,
  Unlock,
  Video,
  VideoOff,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import type { Artwork } from '@/features/artwork'
import { Button, Card } from '@/shared/ui'
import {
  detectArCapabilities,
  type ArExperienceLevel,
  type DeviceArCapabilities,
} from '../capabilities'
import { ArtworkWebXrViewer } from './ArtworkWebXrViewer'

interface Artwork3dWallViewerProps {
  artwork: Artwork
}

type FrameStyle = 'black' | 'walnut' | 'white' | 'gold'

const FRAME_COLORS: Record<FrameStyle, { border: string; hex: number }> = {
  black: { border: '#1a1a1a', hex: 0x1a1a1a },
  walnut: { border: '#5c3a21', hex: 0x5c3a21 },
  white: { border: '#f5f5f0', hex: 0xf5f5f0 },
  gold: { border: '#d4af37', hex: 0xd4af37 },
}

export function Artwork3dWallViewer({ artwork }: Artwork3dWallViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  // Experience mode state
  const [activeMode, setActiveMode] = useState<ArExperienceLevel>('3d-gallery')
  const [capabilities, setCapabilities] = useState<DeviceArCapabilities | null>(null)
  const [scalePercent, setScalePercent] = useState(100)
  const [frameStyle, setFrameStyle] = useState<FrameStyle>('black')
  const [isLocked, setIsLocked] = useState(false)
  const [rotationY, setRotationY] = useState(0)
  const [webXrSupported, setWebXrSupported] = useState<boolean | null>(null)
  const [showInstructions, setShowInstructions] = useState(false)
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const [xrLaunchMessage, setXrLaunchMessage] = useState<string | null>(null)

  // Camera overlay state
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)

  // Drag positioning in Camera Overlay mode
  const [artPosition, setArtPosition] = useState({ x: 0, y: 0 })
  const isDraggingRef = useRef(false)
  const dragStartPosRef = useRef({ x: 0, y: 0 })
  const artPosRef = useRef({ x: 0, y: 0 })

  // Three.js scene refs
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const artworkMeshRef = useRef<THREE.Mesh | null>(null)
  const frameMeshRef = useRef<THREE.Mesh | null>(null)
  const groupRef = useRef<THREE.Group | null>(null)
  const wallMeshRef = useRef<THREE.Mesh | null>(null)
  const floorMeshRef = useRef<THREE.Mesh | null>(null)

  const coverUrl = artwork.images[0]?.url

  // Base dimensions in cm (estimated standard gallery canvas)
  const baseWidthCm = 60
  const baseHeightCm = 80
  const currentWidthCm = ((baseWidthCm * scalePercent) / 100).toFixed(0)
  const currentHeightCm = ((baseHeightCm * scalePercent) / 100).toFixed(0)

  // Detect capabilities on mount
  useEffect(() => {
    let active = true
    void detectArCapabilities().then((caps) => {
      if (!active) return
      setCapabilities(caps)
      setWebXrSupported(caps.immersiveArSupported)
    })
    return () => {
      active = false
    }
  }, [])

  // Manage camera stream lifecycle for Level 2 Camera Overlay
  useEffect(() => {
    if (activeMode !== 'camera-overlay') {
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((track) => track.stop())
        cameraStreamRef.current = null
      }
      setCameraActive(false)
      setCameraError(null)
      return
    }

    let active = true
    setCameraError(null)

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setCameraError('Camera API is not supported in this browser.')
      return
    }

    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })
      .then((stream) => {
        if (!active) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        cameraStreamRef.current = stream
        setCameraActive(true)
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play().catch(() => undefined)
        }
      })
      .catch((err: unknown) => {
        if (!active) return
        const name = err instanceof DOMException ? err.name : ''
        if (name === 'NotAllowedError') {
          setCameraError('Camera access was denied. Please allow camera permissions in browser settings.')
        } else if (name === 'NotFoundError') {
          setCameraError('No camera found on this device.')
        } else {
          setCameraError('Could not start camera feed. Please check browser camera permissions.')
        }
      })

    return () => {
      active = false
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((track) => track.stop())
        cameraStreamRef.current = null
      }
    }
  }, [activeMode])

  // Initialize Three.js 3D View (used for both 3D Gallery Wall and Camera Overlay)
  useEffect(() => {
    const container = mountRef.current
    if (!container) return

    const width = container.clientWidth || 600
    const height = container.clientHeight || 420

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      return
    }

    const scene = new THREE.Scene()
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100)
    camera.position.set(0, 0, 3.2)
    cameraRef.current = camera

    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    rendererRef.current = renderer
    container.innerHTML = ''
    container.appendChild(renderer.domElement)

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8)
    scene.add(ambientLight)

    const spotLight = new THREE.SpotLight(0xfff8e7, 2.5)
    spotLight.position.set(0, 3, 2.5)
    spotLight.angle = Math.PI / 4
    spotLight.penumbra = 0.5
    scene.add(spotLight)

    // Gallery Wall Background
    const wallGeo = new THREE.PlaneGeometry(10, 8)
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x1b1e24,
      roughness: 0.9,
    })
    const wallMesh = new THREE.Mesh(wallGeo, wallMat)
    wallMesh.position.z = -0.1
    wallMeshRef.current = wallMesh
    scene.add(wallMesh)

    // Baseboard floor accent
    const floorGeo = new THREE.PlaneGeometry(10, 3)
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0b0d10,
      roughness: 0.7,
    })
    const floorMesh = new THREE.Mesh(floorGeo, floorMat)
    floorMesh.rotation.x = -Math.PI / 2
    floorMesh.position.y = -1.8
    floorMeshRef.current = floorMesh
    scene.add(floorMesh)

    // Group for Artwork + Frame
    const artGroup = new THREE.Group()
    groupRef.current = artGroup
    scene.add(artGroup)

    // Frame Mesh
    const frameGeo = new THREE.BoxGeometry(1.28, 1.68, 0.05)
    const frameMat = new THREE.MeshStandardMaterial({
      color: FRAME_COLORS[frameStyle].hex,
      roughness: 0.4,
      metalness: frameStyle === 'gold' ? 0.7 : 0.1,
    })
    const frameMesh = new THREE.Mesh(frameGeo, frameMat)
    frameMeshRef.current = frameMesh
    artGroup.add(frameMesh)

    // Artwork Canvas Mesh with Image Texture
    const canvasGeo = new THREE.PlaneGeometry(1.2, 1.6)
    if (coverUrl) {
      const textureLoader = new THREE.TextureLoader()
      textureLoader.load(
        coverUrl,
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace
          const canvasMat = new THREE.MeshBasicMaterial({ map: texture })
          const canvasMesh = new THREE.Mesh(canvasGeo, canvasMat)
          canvasMesh.position.z = 0.026
          artworkMeshRef.current = canvasMesh
          artGroup.add(canvasMesh)
        },
        undefined,
        () => {
          const canvasMat = new THREE.MeshStandardMaterial({ color: 0x2d3748 })
          const canvasMesh = new THREE.Mesh(canvasGeo, canvasMat)
          canvasMesh.position.z = 0.026
          artGroup.add(canvasMesh)
        },
      )
    }

    // Adjust scene background based on activeMode
    if (activeMode === 'camera-overlay') {
      scene.background = null
      renderer.setClearColor(0x000000, 0)
      wallMesh.visible = false
      floorMesh.visible = false
    } else {
      scene.background = new THREE.Color(0x0f1115)
      renderer.setClearColor(0x0f1115, 1)
      wallMesh.visible = true
      floorMesh.visible = true
    }

    // Animation Loop
    let animId: number
    const animate = () => {
      animId = requestAnimationFrame(animate)
      renderer.render(scene, camera)
    }
    animate()

    // Resize handler
    const handleResize = () => {
      if (!container || !renderer || !camera) return
      const w = container.clientWidth
      const h = container.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', handleResize)
      renderer.dispose()
    }
  }, [coverUrl, activeMode])

  // Update Scale
  useEffect(() => {
    if (!groupRef.current) return
    const s = scalePercent / 100
    groupRef.current.scale.set(s, s, s)
  }, [scalePercent])

  // Update Rotation
  useEffect(() => {
    if (!groupRef.current) return
    groupRef.current.rotation.y = THREE.MathUtils.degToRad(rotationY)
  }, [rotationY])

  // Update Frame Color
  useEffect(() => {
    if (!frameMeshRef.current) return
    const mat = frameMeshRef.current.material as THREE.MeshStandardMaterial
    mat.color.setHex(FRAME_COLORS[frameStyle].hex)
    mat.metalness = frameStyle === 'gold' ? 0.7 : 0.1
  }, [frameStyle])

  // Update Position in Camera Overlay mode
  useEffect(() => {
    if (!groupRef.current) return
    if (activeMode === 'camera-overlay') {
      groupRef.current.position.x = artPosition.x
      groupRef.current.position.y = artPosition.y
    } else {
      groupRef.current.position.set(0, 0, 0)
    }
  }, [artPosition, activeMode])

  // Drag handlers for Camera Overlay mode
  const handlePointerDown = (e: React.PointerEvent) => {
    if (isLocked || activeMode !== 'camera-overlay') return
    isDraggingRef.current = true
    dragStartPosRef.current = { x: e.clientX, y: e.clientY }
    artPosRef.current = { ...artPosition }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current || isLocked) return
    const dx = (e.clientX - dragStartPosRef.current.x) * 0.005
    const dy = (dragStartPosRef.current.y - e.clientY) * 0.005
    const nextPos = {
      x: Math.max(-2.5, Math.min(2.5, artPosRef.current.x + dx)),
      y: Math.max(-1.8, Math.min(1.8, artPosRef.current.y + dy)),
    }
    setArtPosition(nextPos)
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    isDraggingRef.current = false
    try {
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      // Ignore if already released
    }
  }

  const handleReset = () => {
    setScalePercent(100)
    setRotationY(0)
    setArtPosition({ x: 0, y: 0 })
    setIsLocked(false)
  }

  // If user selected Full Immersive WebXR AR, render ArtworkWebXrViewer
  if (activeMode === 'immersive-ar') {
    return (
      <div className="flex flex-col gap-4">
        <ArtworkWebXrViewer
          artwork={artwork}
          onExit={() => setActiveMode('3d-gallery')}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Experience Tier Selector Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface-elevated p-1.5 text-xs">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveMode('3d-gallery')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition-colors ${
              activeMode === '3d-gallery'
                ? 'bg-accent-gold text-black shadow-sm'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface'
            }`}
          >
            <Eye aria-hidden="true" className="h-3.5 w-3.5" />
            3D Gallery Wall
          </button>

          <button
            type="button"
            onClick={() => setActiveMode('camera-overlay')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition-colors ${
              activeMode === 'camera-overlay'
                ? 'bg-accent-gold text-black shadow-sm'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface'
            }`}
          >
            <Video aria-hidden="true" className="h-3.5 w-3.5" />
            Live Camera View
          </button>

          {webXrSupported === true && (
            <button
              type="button"
              onClick={() => setActiveMode('immersive-ar')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 px-3 py-1.5 font-medium transition-colors border border-blue-500/30"
            >
              <Camera aria-hidden="true" className="h-3.5 w-3.5" />
              Immersive WebXR
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowDiagnostics(!showDiagnostics)}
          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] text-text-muted hover:text-text-primary"
        >
          <Info aria-hidden="true" className="h-3.5 w-3.5" />
          <span>Device & Connection Guide</span>
          {showDiagnostics ? (
            <ChevronUp aria-hidden="true" className="h-3 w-3" />
          ) : (
            <ChevronDown aria-hidden="true" className="h-3 w-3" />
          )}
        </button>
      </div>

      {/* Expandable Device & Connection Guide */}
      {showDiagnostics && (
        <Card className="flex flex-col gap-3 p-4 text-xs border-cyan-500/30 bg-cyan-950/20">
          <div className="flex items-center gap-2 text-cyan-300 font-semibold">
            <Smartphone aria-hidden="true" className="h-4 w-4" />
            <span>Universal AR Device & Capability Matrix</span>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-text-secondary">
            <div className="flex items-center justify-between rounded-lg bg-black/40 p-2 border border-white/5">
              <span>Secure Context (HTTPS / localhost):</span>
              <span className="font-mono text-cyan-200">
                {capabilities?.isSecureContext ? '✅ Secure' : '⚠️ Insecure HTTP'}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-black/40 p-2 border border-white/5">
              <span>WebXR API:</span>
              <span className="font-mono text-cyan-200">
                {capabilities?.hasWebXrApi ? '✅ Available' : '❌ Not in browser'}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-black/40 p-2 border border-white/5">
              <span>Immersive AR Session:</span>
              <span className="font-mono text-cyan-200">
                {capabilities?.immersiveArSupported
                  ? '✅ Supported (Hit-test ready)'
                  : '❌ Unsupported'}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-black/40 p-2 border border-white/5">
              <span>Camera API (getUserMedia):</span>
              <span className="font-mono text-cyan-200">
                {capabilities?.hasCameraApi ? '✅ Ready' : '❌ Unavailable'}
              </span>
            </div>
          </div>

          <div className="rounded-lg bg-black/50 p-3 text-[11px] text-text-muted space-y-1.5 border border-white/5">
            <p className="font-medium text-text-secondary">Connection Modes:</p>
            <p>
              • <strong>Wireless Production:</strong> When deployed to HTTPS, WebXR and camera AR work completely wirelessly across all compatible phones, tablets, and computers with zero cables needed.
            </p>
            <p>
              • <strong>USB Development:</strong> Connect Android over USB and run <code className="text-accent-gold">adb reverse tcp:5173 tcp:5173</code>, then open <code className="text-accent-gold">http://localhost:5173</code> on your phone so Chrome treats it as a secure origin.
            </p>
            <p>
              • <strong>Wi-Fi LAN Development:</strong> If accessing via <code className="text-accent-gold">http://192.168.x.x:5173</code> without HTTPS, browsers block camera and WebXR access for security. Use USB ADB reverse or deploy to HTTPS for wireless access.
            </p>
          </div>
        </Card>
      )}

      {/* Viewport Canvas Container */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-surface-elevated shadow-elevated">
        {/* Live Video Feed Background for Camera Mode */}
        {activeMode === 'camera-overlay' && (
          <div className="absolute inset-0 z-0 overflow-hidden bg-black">
            <video
              ref={videoRef}
              playsInline
              autoPlay
              muted
              className="h-full w-full object-cover"
            />
            {cameraError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center bg-black/85 text-white">
                <VideoOff className="h-8 w-8 text-rose-400" />
                <p className="text-sm font-medium">{cameraError}</p>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setActiveMode('3d-gallery')}
                >
                  Return to 3D Gallery Wall
                </Button>
              </div>
            )}
            {!cameraActive && !cameraError && (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-white/70">
                Initializing camera feed...
              </div>
            )}
          </div>
        )}

        {/* 3D Canvas Mount Point */}
        <div
          ref={mountRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{ touchAction: activeMode === 'camera-overlay' && !isLocked ? 'none' : 'auto' }}
          className="relative z-10 h-[22rem] w-full sm:h-[30rem] cursor-grab active:cursor-grabbing"
        />

        {/* Status Overlay Badge */}
        <div className="absolute top-3 left-3 z-20 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-black/75 px-3 py-1 text-xs font-medium text-white backdrop-blur-md border border-white/10">
            {activeMode === 'camera-overlay' ? (
              <>
                <Video aria-hidden="true" className="h-3.5 w-3.5 text-accent-gold" />
                Live Camera Room View
              </>
            ) : (
              <>
                <Eye aria-hidden="true" className="h-3.5 w-3.5 text-accent-gold" />
                3D Gallery Wall Simulation
              </>
            )}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-black/75 px-2.5 py-1 text-xs text-text-muted backdrop-blur-md border border-white/10">
            Scale: {scalePercent}% ({currentWidthCm} × {currentHeightCm} cm)
          </span>
        </div>

        {/* Lock Overlay Badge – compact glass */}
        <div className="absolute top-2 right-2 z-20">
          <button
            type="button"
            onClick={() => setIsLocked(!isLocked)}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold backdrop-blur-md transition-all shadow-md ${
              isLocked
                ? 'bg-emerald-500/50 text-emerald-100 hover:bg-emerald-500/65 border border-emerald-400/30'
                : 'bg-black/40 text-accent-gold hover:bg-black/55 border border-accent-gold/30'
            }`}
          >
            {isLocked ? (
              <>
                <Lock aria-hidden="true" className="h-3 w-3" />
                LOCKED
              </>
            ) : (
              <>
                <Unlock aria-hidden="true" className="h-3 w-3" />
                UNLOCKED
              </>
            )}
          </button>
        </div>

        {/* Camera mode dragging notice */}
        {activeMode === 'camera-overlay' && !isLocked && (
          <div className="pointer-events-none absolute inset-x-4 top-14 z-20 text-center">
            <span className="inline-block rounded-full bg-black/70 px-3 py-1 text-[11px] text-white/90 backdrop-blur-md border border-white/10">
              Drag on screen to reposition artwork in room
            </span>
          </div>
        )}

        {/* Bottom Floating Controls Bar – compact glassmorphism */}
        <div className="absolute inset-x-2 bottom-2 z-20 flex flex-wrap items-center justify-between gap-1.5 rounded-xl bg-black/40 px-2 py-1.5 backdrop-blur-lg border border-white/10 shadow-lg text-xs text-white">
          {/* Frame Style Selectors */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-white/50 mr-0.5">Frame:</span>
            {(['black', 'walnut', 'white', 'gold'] as const).map((style) => (
              <button
                key={style}
                type="button"
                onClick={() => setFrameStyle(style)}
                className={`h-5 w-5 rounded-full border-2 transition-transform ${
                  frameStyle === style ? 'scale-110 border-accent-gold shadow-sm' : 'border-white/20 hover:scale-105'
                }`}
                style={{ backgroundColor: FRAME_COLORS[style].border }}
                title={`Frame style: ${style}`}
                aria-label={`Frame style: ${style}`}
              />
            ))}
          </div>

          {/* Scale Buttons */}
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              disabled={isLocked || scalePercent <= 40}
              onClick={() => setScalePercent((p) => Math.max(40, p - 10))}
              className="rounded p-1 text-white/75 hover:bg-white/10 disabled:opacity-35"
              title="Decrease scale"
              aria-label="Decrease scale"
            >
              <ZoomOut aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
            <span className="min-w-[2.6rem] text-center font-mono text-[11px]">{scalePercent}%</span>
            <button
              type="button"
              disabled={isLocked || scalePercent >= 250}
              onClick={() => setScalePercent((p) => Math.min(250, p + 10))}
              className="rounded p-1 text-white/75 hover:bg-white/10 disabled:opacity-35"
              title="Increase scale"
              aria-label="Increase scale"
            >
              <ZoomIn aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Rotation & Reset */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={isLocked}
              onClick={() => setRotationY((r) => (r + 15) % 360)}
              className="inline-flex items-center gap-0.5 rounded bg-white/10 px-1.5 py-1 text-[10px] hover:bg-white/20 disabled:opacity-35"
              title="Rotate artwork angle"
            >
              <RotateCw aria-hidden="true" className="h-3 w-3" />
              <span>Rotate</span>
            </button>

            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-0.5 rounded bg-white/10 px-1.5 py-1 text-[10px] hover:bg-white/20"
              title="Reset position and scale"
            >
              <RefreshCw aria-hidden="true" className="h-3 w-3" />
              <span>Reset</span>
            </button>
          </div>
        </div>
      </div>

      {/* Manual Controls Card – compact */}
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Sliders aria-hidden="true" className="h-3.5 w-3.5 text-accent-gold" />
            <h3 className="font-medium text-xs text-text-primary">Dimensions &amp; Placement</h3>
          </div>
          <button
            type="button"
            onClick={() => setShowInstructions(!showInstructions)}
            className="inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-text-primary"
          >
            <Info aria-hidden="true" className="h-3 w-3" />
            <span>{showInstructions ? 'Hide tips' : 'Tips'}</span>
          </button>
        </div>

        {showInstructions && (
          <div className="rounded-lg bg-surface-elevated p-3 text-[11px] text-text-secondary border border-border flex flex-col gap-1">
            <p className="font-semibold text-text-primary">Surface &amp; Wall Placement Tips:</p>
            <ul className="list-disc list-inside space-y-0.5 text-text-muted">
              <li>Ensure the room is well-lit and the wall has some visual texture or frame contrast.</li>
              <li>In Live Camera mode, drag with one finger or mouse to adjust artwork placement against your real wall.</li>
              <li>Press the <strong>LOCKED</strong> toggle once aligned to freeze position.</li>
              <li>On WebXR-supported devices (Chrome on Android with ARCore), tap <strong>Launch Camera Wall AR</strong> for automatic plane detection.</li>
            </ul>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
          {/* Scale Slider */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between">
              <span className="text-text-secondary font-medium text-[11px]">Scale</span>
              <span className="font-mono text-accent-gold text-[11px]">{scalePercent}% ({currentWidthCm} × {currentHeightCm} cm)</span>
            </div>
            <input
              type="range"
              min={40}
              max={250}
              step={5}
              disabled={isLocked}
              value={scalePercent}
              onChange={(e) => setScalePercent(Number(e.target.value))}
              className="h-1 w-full rounded-lg bg-surface-elevated accent-accent-gold disabled:opacity-40"
            />
          </div>

          {/* Wall Perspective Slider */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between">
              <span className="text-text-secondary font-medium text-[11px]">Yaw Angle</span>
              <span className="font-mono text-text-muted text-[11px]">{rotationY}°</span>
            </div>
            <input
              type="range"
              min={-45}
              max={45}
              step={5}
              disabled={isLocked}
              value={rotationY}
              onChange={(e) => setRotationY(Number(e.target.value))}
              className="h-1 w-full rounded-lg bg-surface-elevated accent-accent-gold disabled:opacity-40"
            />
          </div>
        </div>

        {/* WebXR Camera Status */}
        <div className="flex flex-col gap-1.5 pt-2 border-t border-border sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-1.5 text-[11px]">
            <Camera aria-hidden="true" className="h-3.5 w-3.5 text-blue-400 shrink-0" />
            <span className="text-text-secondary">
              {webXrSupported === true
                ? 'WebXR immersive-ar supported'
                : 'WebXR not detected — 3D simulation active'}
            </span>
          </div>

          {webXrSupported === true ? (
            <Button
              variant="info"
              size="sm"
              onClick={() => {
                setXrLaunchMessage(
                  'WebXR detected. Starting camera AR session...',
                )
                setActiveMode('immersive-ar')
              }}
              className="text-[11px]"
            >
              Launch Camera Wall AR
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setActiveMode(activeMode === 'camera-overlay' ? '3d-gallery' : 'camera-overlay')}
                className="text-[11px]"
              >
                {activeMode === 'camera-overlay' ? 'Switch to 3D Wall' : 'Try Live Camera AR'}
              </Button>
              <span className="text-[10px] text-text-muted">
                Works on all browsers.
              </span>
            </div>
          )}
        </div>

        {xrLaunchMessage && (
          <div role="status" className="rounded-lg border border-cyan-500/30 bg-cyan-950/40 p-2 text-[11px] text-cyan-200">
            {xrLaunchMessage}
          </div>
        )}
      </Card>
    </div>
  )
}
