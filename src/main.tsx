import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { AppProviders } from '@/app/providers/AppProviders'
import { AuthProvider } from '@/app/providers/AuthProvider'
import { router } from '@/app/routes/router'
import { WishlistProvider } from '@/features/wishlist'
import { connectFirebaseEmulators } from '@/lib/firebase/config'
import './index.css'

connectFirebaseEmulators()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <AuthProvider>
        {/* Needs useAuth() (guest vs. account mode) — must sit inside
            AuthProvider. Wraps the router, not just one route, so its one
            shared wishlist listener/local-storage state survives
            navigating between Marketplace, an artist page, and /wishlist
            itself. */}
        <WishlistProvider>
          <RouterProvider router={router} />
        </WishlistProvider>
      </AuthProvider>
    </AppProviders>
  </StrictMode>,
)
