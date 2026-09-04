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

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'sign-in', element: <SignInPage /> },
      { path: 'sign-up', element: <SignUpPage /> },
      {
        element: <RequireAuth />,
        children: [
          { path: 'account', element: <AccountPage /> },
          { path: 'seller/apply', element: <SellerApplicationPage /> },
          {
            element: <RequireRole allow={['SELLER']} />,
            children: [
              { path: 'seller-studio', element: <SellerStudioHomePage /> },
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
