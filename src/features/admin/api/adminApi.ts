import { rpc } from '@/lib/supabase/data'
export interface AdminActionError {message:string}
export const approveSellerApplication=(uid:string)=>rpc('review_seller',{target:uid,decision:'APPROVED'})
export const rejectSellerApplication=(uid:string,rejectionReason:string)=>rpc('review_seller',{target:uid,decision:'REJECTED',reason:rejectionReason})
export const moderateArtwork=(artworkId:string,decision:'PUBLISHED'|'REJECTED',rejectionReason?:string)=>rpc('moderate_artwork',{target:artworkId,decision,reason:rejectionReason??null})
export const suspendArtwork=(artworkId:string,reason:string)=>rpc('moderate_artwork',{target:artworkId,decision:'SUSPENDED',reason})
export function isAdminActionError(value:unknown):value is AdminActionError {return typeof value==='object'&&value!==null&&'message' in value&&typeof value.message==='string'}
