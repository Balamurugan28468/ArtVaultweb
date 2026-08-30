import { lazy } from 'react'
import { createBrowserRouter } from 'react-router'
import { AppShell } from '@/app/layouts/AppShell'
import { HomePage } from '@/app/routes/HomePage'
import { RequireAuth } from '@/app/routes/guards/RequireAuth'

const SignInPage = lazy(() => import('@/app/routes/SignInPage').then((m) => ({ default: m.SignInPage })))
const SignUpPage = lazy(() => import('@/app/routes/SignUpPage').then((m) => ({ default: m.SignUpPage })))
const AccountPlaceholderPage = lazy(() =>
  import('@/app/routes/AccountPlaceholderPage').then((m) => ({ default: m.AccountPlaceholderPage })),
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
        children: [{ path: 'account', element: <AccountPlaceholderPage /> }],
      },
    ],
  },
])
