export type LikeErrorCode = 'permission-denied' | 'network' | 'unknown'

export interface LikeError {
  code: LikeErrorCode
  message: string
}

export function isLikeError(value: unknown): value is LikeError {
  return typeof value === 'object' && value !== null && 'code' in value && 'message' in value
}
