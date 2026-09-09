export { getAuthoritativeLikeState, hasLiked, likeArtwork, toLikeError, unlikeArtwork, type AuthoritativeLikeState } from './api/likeRepository'
export { LikeButton } from './components/LikeButton'
export { useLike, type UseLikeResult } from './hooks/useLike'
export { isLikeError, type LikeError, type LikeErrorCode } from './types'
