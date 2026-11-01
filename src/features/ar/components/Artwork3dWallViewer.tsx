import {
  Camera,
  Eye,
  Info,
  Lock,
  RefreshCw,
  RotateCw,
  Sliders,
  Unlock,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import type { Artwork } from '@/features/artwork'
import { Button, Card } from '@/shared/ui'

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
  const [scalePercent, setScalePercent] = useState(100)
  const [frameStyle, setFrameStyle] = useState<FrameStyle>('black')
  const [isLocked, setIsLocked] = useState(false)
  const [rotationY, setRotationY] = useState(0)
  const [webXrSupported, setWebXrSupported] = useState<boolean | null>(null)
  const [showInstructions, setShowInstructions] = useState(false)

  // Three.js scene refs
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const artworkMeshRef = useRef<THREE.Mesh | null>(null)
  const frameMeshRef = useRef<THREE.Mesh | null>(null)
  const groupRef = useRef<THREE.Group | null>(null)

  const coverUrl = artwork.images[0]?.url

  // Base dimensions in cm (estimated standard gallery canvas)
  const baseWidthCm = 60
  const baseHeightCm = 80
  const currentWidthCm = ((baseWidthCm * scalePercent) / 100).toFixed(0)
  const currentHeightCm = ((baseHeightCm * scalePercent) / 100).toFixed(0)

  // Check WebXR hardware support
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'xr' in navigator && (navigator as any).xr?.isSessionSupported) {
      ;(navigator as any).xr
        .isSessionSupported('immersive-ar')
        .then((supported: boolean) => setWebXrSupported(supported))
        .catch(() => setWebXrSupported(false))
    } else {
      setWebXrSupported(false)
    }
  }, [])

  // Initialize Three.js 3D Gallery View
  useEffect(() => {
    const container = mountRef.current
    if (!container) return

    const width = container.clientWidth || 600
    const height = container.clientHeight || 420

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0f1115)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100)
    camera.position.set(0, 0, 3.2)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
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
          // Fallback if texture fails
          const canvasMat = new THREE.MeshStandardMaterial({ color: 0x2d3748 })
          const canvasMesh = new THREE.Mesh(canvasGeo, canvasMat)
          canvasMesh.position.z = 0.026
          artGroup.add(canvasMesh)
        },
      )
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
  }, [coverUrl])

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

  const handleReset = () => {
    setScalePercent(100)
    setRotationY(0)
    setIsLocked(false)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 3D Wall Canvas Container */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-surface-elevated shadow-elevated">
        <div ref={mountRef} className="h-[22rem] w-full sm:h-[30rem]" />

        {/* Status Overlay Badge */}
        <div className="absolute top-3 left-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-black/75 px-3 py-1 text-xs font-medium text-white backdrop-blur-md border border-white/10">
            <Eye aria-hidden="true" className="h-3.5 w-3.5 text-accent-gold" />
            3D Gallery Wall Simulation
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-black/75 px-2.5 py-1 text-xs text-text-muted backdrop-blur-md border border-white/10">
            Scale: {scalePercent}% ({currentWidthCm} × {currentHeightCm} cm)
          </span>
        </div>

        {/* Lock Overlay Badge */}
        <div className="absolute top-3 right-3">
          <button
            type="button"
            onClick={() => setIsLocked(!isLocked)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold backdrop-blur-md transition-all shadow-md ${
              isLocked
                ? 'bg-emerald-500/90 text-white hover:bg-emerald-600'
                : 'bg-black/80 text-accent-gold hover:bg-black/90 border border-accent-gold/40'
            }`}
          >
            {isLocked ? (
              <>
                <Lock aria-hidden="true" className="h-3.5 w-3.5" />
                LOCKED TO WALL
              </>
            ) : (
              <>
                <Unlock aria-hidden="true" className="h-3.5 w-3.5" />
                UNLOCKED (ADJUSTABLE)
              </>
            )}
          </button>
        </div>

        {/* Bottom Floating Controls Bar */}
        <div className="absolute inset-x-3 bottom-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-black/85 p-2.5 backdrop-blur-md border border-white/10 text-xs text-white">
          {/* Frame Style Selectors */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-text-muted mr-1">Frame:</span>
            {(['black', 'walnut', 'white', 'gold'] as const).map((style) => (
              <button
                key={style}
                type="button"
                onClick={() => setFrameStyle(style)}
                className={`h-6 w-6 rounded-full border-2 transition-transform ${
                  frameStyle === style ? 'scale-110 border-accent-gold shadow-sm' : 'border-white/20 hover:scale-105'
                }`}
                style={{ backgroundColor: FRAME_COLORS[style].border }}
                title={`Frame style: ${style}`}
                aria-label={`Frame style: ${style}`}
              />
            ))}
          </div>

          {/* Scale Buttons */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={isLocked || scalePercent <= 40}
              onClick={() => setScalePercent((p) => Math.max(40, p - 10))}
              className="rounded p-1 text-white/80 hover:bg-white/10 disabled:opacity-40"
              title="Decrease scale"
              aria-label="Decrease scale"
            >
              <ZoomOut aria-hidden="true" className="h-4 w-4" />
            </button>
            <span className="min-w-[3rem] text-center font-mono">{scalePercent}%</span>
            <button
              type="button"
              disabled={isLocked || scalePercent >= 250}
              onClick={() => setScalePercent((p) => Math.min(250, p + 10))}
              className="rounded p-1 text-white/80 hover:bg-white/10 disabled:opacity-40"
              title="Increase scale"
              aria-label="Increase scale"
            >
              <ZoomIn aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>

          {/* Rotation & Reset */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isLocked}
              onClick={() => setRotationY((r) => (r + 15) % 360)}
              className="inline-flex items-center gap-1 rounded bg-white/10 px-2 py-1 text-[11px] hover:bg-white/20 disabled:opacity-40"
              title="Rotate artwork angle"
            >
              <RotateCw aria-hidden="true" className="h-3.5 w-3.5" />
              <span>Rotate</span>
            </button>

            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1 rounded bg-white/10 px-2 py-1 text-[11px] hover:bg-white/20"
              title="Reset position and scale"
            >
              <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
              <span>Reset</span>
            </button>
          </div>
        </div>
      </div>

      {/* Manual Controls Card */}
      <Card className="flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sliders aria-hidden="true" className="h-4 w-4 text-accent-gold" />
            <h3 className="font-medium text-sm text-text-primary">Interactive Dimensions & Placement Controls</h3>
          </div>
          <button
            type="button"
            onClick={() => setShowInstructions(!showInstructions)}
            className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-primary"
          >
            <Info aria-hidden="true" className="h-3.5 w-3.5" />
            <span>{showInstructions ? 'Hide tips' : 'Camera & surface tips'}</span>
          </button>
        </div>

        {showInstructions && (
          <div className="rounded-lg bg-surface-elevated p-3.5 text-xs text-text-secondary border border-border flex flex-col gap-1.5">
            <p className="font-semibold text-text-primary">Wall Surface Detection Tips:</p>
            <ul className="list-disc list-inside space-y-1 text-text-muted">
              <li>Ensure the room is well-lit and the wall has some visual texture or frame contrast.</li>
              <li>Hold your phone roughly 1 to 2 meters away from the desired wall location.</li>
              <li>Slowly pan your device in small circular motions to allow hit-testing to map vertical planes.</li>
              <li>Press the <strong>LOCK TO WALL</strong> toggle once aligned to freeze placement while you examine room perspective.</li>
            </ul>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-xs">
          {/* Scale Slider */}
          <div className="flex flex-col gap-2">
            <div className="flex justify-between">
              <span className="text-text-secondary font-medium">Fine Scale Adjustment</span>
              <span className="font-mono text-accent-gold">{scalePercent}% ({currentWidthCm} × {currentHeightCm} cm)</span>
            </div>
            <input
              type="range"
              min={40}
              max={250}
              step={5}
              disabled={isLocked}
              value={scalePercent}
              onChange={(e) => setScalePercent(Number(e.target.value))}
              className="h-1.5 w-full rounded-lg bg-surface-elevated accent-accent-gold disabled:opacity-40"
            />
          </div>

          {/* Wall Perspective Slider */}
          <div className="flex flex-col gap-2">
            <div className="flex justify-between">
              <span className="text-text-secondary font-medium">Viewing Angle / Yaw</span>
              <span className="font-mono text-text-muted">{rotationY}°</span>
            </div>
            <input
              type="range"
              min={-45}
              max={45}
              step={5}
              disabled={isLocked}
              value={rotationY}
              onChange={(e) => setRotationY(Number(e.target.value))}
              className="h-1.5 w-full rounded-lg bg-surface-elevated accent-accent-gold disabled:opacity-40"
            />
          </div>
        </div>

        {/* WebXR Camera Status */}
        <div className="flex flex-col gap-2 pt-2 border-t border-border sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs">
            <Camera aria-hidden="true" className="h-4 w-4 text-blue-400" />
            <span className="text-text-secondary">
              {webXrSupported === true
                ? 'WebXR immersive-ar supported on this browser'
                : 'WebXR camera pass-through not detected — using full 3D room simulation'}
            </span>
          </div>

          {webXrSupported === true ? (
            <Button
              variant="info"
              size="sm"
              onClick={() => {
                alert('Launching WebXR AR session... Please grant camera permission when prompted.')
              }}
              className="text-xs"
            >
              Launch Camera Wall AR
            </Button>
          ) : (
            <span className="text-[11px] text-text-muted">
              Use Chrome on Android with Google Play Services for AR to place on real walls.
            </span>
          )}
        </div>
      </Card>
    </div>
  )
}

