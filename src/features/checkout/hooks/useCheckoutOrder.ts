import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { createCheckoutOrder, type CheckoutRequest } from '../api/checkoutOrder'

const keyFor = (uid: string) => `artvault:pending-checkout:${uid}`
function read(uid: string | undefined): CheckoutRequest | null {
  if (!uid) return null
  try {
    const value = JSON.parse(sessionStorage.getItem(keyFor(uid)) ?? 'null') as CheckoutRequest | null
    return value && Array.isArray(value.artworkIds) && value.artworkIds.every((id) => typeof id === 'string') && typeof value.addressId === 'string' && typeof value.idempotencyKey === 'string' ? value : null
  } catch { return null }
}
function clear(uid: string) {
  try { sessionStorage.removeItem(keyFor(uid)) } catch { /* A retained key can safely replay the same result. */ }
}
/** Keep the same request through ambiguous network failures and page reloads. */
export function useCheckoutOrder(uid: string | undefined) {
  const navigate = useNavigate()
  const busy = useRef(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, setRevision] = useState(0)
  const unresolved = read(uid)
  const submit = async (artworkIds: string[], addressId: string) => {
    if (!uid || busy.current) return
    busy.current = true; setPending(true); setError(null)
    try {
      // Fail before making a request if retry identity cannot be retained.
      const input = read(uid) ?? { artworkIds: [...artworkIds].sort(), addressId, idempotencyKey: crypto.randomUUID() }
      try { sessionStorage.setItem(keyFor(uid), JSON.stringify(input)) } catch {
        setError('Enable browser session storage before creating an order so interrupted requests can be recovered safely.')
        return
      }
      const receipt = await createCheckoutOrder(input)
      clear(uid)
      navigate(`/checkout/confirmation/${receipt.orderId}`)
    } catch (cause) {
      const code = typeof cause === 'object' && cause !== null && 'code' in cause ? String(cause.code) : ''
      const definite = ['functions/invalid-argument', 'functions/permission-denied', 'functions/unauthenticated', 'functions/failed-precondition', 'functions/not-found'].includes(code)
      if (definite) clear(uid)
      setError(definite && typeof cause === 'object' && cause !== null && 'message' in cause && typeof cause.message === 'string' ? cause.message : 'Order creation could not be confirmed. Retry the same checkout to recover its result; do not start another request.')
    } finally { busy.current = false; setPending(false); setRevision((value) => value + 1) }
  }
  return { pending, error, unresolved, submit, retry: () => unresolved ? submit(unresolved.artworkIds, unresolved.addressId) : Promise.resolve() }
}
