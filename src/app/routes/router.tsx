import { lazy } from 'react'
import { createBrowserRouter } from 'react-router'
import { AppShell } from '@/app/layouts/AppShell'
import { HomePage } from '@/app/routes/HomePage'
import { RequireAuth } from '@/app/routes/guards/RequireAuth'
import { RequireRole } from '@/app/routes/guards/RequireRole'

const SignInPage = lazy(() => import('@/app/routes/SignInPage').then((m) => ({ default: m.SignInPage })))
const SignUpPage = lazy(() => import('@/app/routes/SignUpPage').then((m) => ({ default: m.SignUpPage })))
const AccountPage = lazy(() => import('@/app/routes/AccountPage').then((m) => ({ default: m.AccountPage })))
const SellerApplicationPage = lazy(() =>
  import('@/app/routes/SellerApplicationPage').then((m) => ({ default: m.SellerApplicationPage })),
)
const SellerStudioHomePage = lazy(() =>
  import('@/app/routes/SellerStudioHomePage').then((m) => ({ default: m.SellerStudioHomePage })),
)
const ArtworkListPage = lazy(() =>
  import('@/app/routes/ArtworkListPage').then((m) => ({ default: m.ArtworkListPage })),
)
const ArtworkFormPage = lazy(() =>
  import('@/app/routes/ArtworkFormPage').then((m) => ({ default: m.ArtworkFormPage })),
)
const ArtistProfilePage = lazy(() =>
  import('@/app/routes/ArtistProfilePage').then((m) => ({ default: m.ArtistProfilePage })),
)
const MarketplacePage = lazy(() =>
  import('@/app/routes/MarketplacePage').then((m) => ({ default: m.MarketplacePage })),
)
const SellerProfilePage = lazy(() =>
  import('@/app/routes/SellerProfilePage').then((m) => ({ default: m.SellerProfilePage })),
)

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'sign-in', element: <SignInPage /> },
      { path: 'sign-up', element: <SignUpPage /> },
      { path: 'explore', element: <MarketplacePage /> },
      { path: 'artists/:artistId', element: <ArtistProfilePage /> },
      {
        element: <RequireAuth />,
        children: [
          { path: 'account', element: <AccountPage /> },
          { path: 'seller/apply', element: <SellerApplicationPage /> },
          {
            element: <RequireRole allow={['SELLER']} />,
            children: [
              { path: 'seller-studio', element: <SellerStudioHomePage /> },
              { path: 'seller-studio/profile', element: <SellerProfilePage /> },
              { path: 'seller-studio/artworks', element: <ArtworkListPage /> },
              { path: 'seller-studio/artworks/new', element: <ArtworkFormPage mode="create" /> },
              { path: 'seller-studio/artworks/:id/edit', element: <ArtworkFormPage mode="edit" /> },
            ],
          },
        ],
      },
    ],
  },
])
