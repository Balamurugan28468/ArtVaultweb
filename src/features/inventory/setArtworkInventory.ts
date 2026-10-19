import { rpc } from '@/lib/supabase/data'
export const setArtworkInventory=(artworkId:string,inventoryCount:number)=>rpc('set_artwork_inventory',{target:artworkId,quantity:inventoryCount})
