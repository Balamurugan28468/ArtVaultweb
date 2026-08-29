import { createBrowserRouter } from 'react-router'
import { RootLayout } from '@/app/layouts/RootLayout'
import { HomePage } from '@/app/routes/HomePage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [{ index: true, element: <HomePage /> }],
  },
])
