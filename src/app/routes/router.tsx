import { createBrowserRouter } from 'react-router'
import { RootLayout } from '@/app/layouts/RootLayout'
import { AccountPlaceholderPage } from '@/app/routes/AccountPlaceholderPage'
import { HomePage } from '@/app/routes/HomePage'
import { RequireAuth } from '@/app/routes/guards/RequireAuth'
import { SignInPage } from '@/app/routes/SignInPage'
import { SignUpPage } from '@/app/routes/SignUpPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
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
