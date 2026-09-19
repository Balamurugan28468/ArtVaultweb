export interface ArProof {
  artworkId: string
  imageId: string
  widthMm: number
  heightMm: number
  includesFrame: boolean
  modelUrl: string
  version: string
}

export function parseProof(value: unknown, artworkId: string): ArProof | null {
  if (!value || typeof value !== 'object') return null
  const p = value as Partial<ArProof>
  if (p.artworkId !== artworkId || typeof p.imageId !== 'string' || typeof p.includesFrame !== 'boolean' ||
    !Number.isSafeInteger(p.widthMm) || !Number.isSafeInteger(p.heightMm) ||
    p.widthMm! <= 0 || p.heightMm! <= 0 || p.widthMm! > 10000 || p.heightMm! > 10000 ||
    typeof p.version !== 'string' || !/^[a-f0-9]{64}$/.test(p.version) ||
    p.modelUrl !== `/__ar-proof/model/${p.version}.glb`) return null
  return p as ArProof
}
