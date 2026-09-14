import { lazy } from 'react'
import { createBrowserRouter, Navigate } from 'react-router'
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
const ArtworkDetailPage = lazy(() =>
  import('@/app/routes/ArtworkDetailPage').then((m) => ({ default: m.ArtworkDetailPage })),
)
const MarketplacePage = lazy(() =>
  import('@/app/routes/MarketplacePage').then((m) => ({ default: m.MarketplacePage })),
)
const AuctionsPage = lazy(() => import('@/app/routes/AuctionsPage').then((m) => ({ default: m.AuctionsPage })))
const AuctionDetailPage = lazy(() =>
  import('@/app/routes/AuctionDetailPage').then((m) => ({ default: m.AuctionDetailPage })),
)
const WishlistPage = lazy(() =>
  import('@/app/routes/WishlistPage').then((m) => ({ default: m.WishlistPage })),
)
const SellerProfilePage = lazy(() =>
  import('@/app/routes/SellerProfilePage').then((m) => ({ default: m.SellerProfilePage })),
)
const AdminPage = lazy(() => import('@/app/routes/AdminPage').then((m) => ({ default: m.AdminPage })))
const CartPage = lazy(() => import('@/app/routes/CartPage').then((m) => ({ default: m.CartPage })))
const CheckoutPage = lazy(() => import('@/app/routes/CheckoutPage').then((m) => ({ default: m.CheckoutPage })))
const OrderConfirmationPage = lazy(() =>
  import('@/app/routes/OrderConfirmationPage').then((m) => ({ default: m.OrderConfirmationPage })),
)
const OrdersPage = lazy(() => import('@/app/routes/OrdersPage').then((m) => ({ default: m.OrdersPage })))
const OrderDetailsPage = lazy(() =>
  import('@/app/routes/OrderDetailsPage').then((m) => ({ default: m.OrderDetailsPage })),
)
const NotFoundPage = lazy(() => import('@/app/routes/NotFoundPage').then((m) => ({ default: m.NotFoundPage })))

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'sign-in', element: <SignInPage /> },
      { path: 'sign-up', element: <SignUpPage /> },
      { path: 'explore', element: <MarketplacePage /> },
      // UI-04 — public, same as Explore/Artwork Detail: works whether or
      // not anyone is signed in.
      { path: 'auctions', element: <AuctionsPage /> },
      { path: 'auctions/:auctionId', element: <AuctionDetailPage /> },
      // UI-01 mobile correction: Categories was a duplicate of Explore's own
      // category discovery (strip + sidebar filter) — removed as a distinct
      // page and nav entry. This redirect keeps any bookmarked/shared
      // `/categories` link working rather than breaking it outright.
      { path: 'categories', element: <Navigate to="/explore" replace /> },
      { path: 'wishlist', element: <WishlistPage /> },
      // Cart is genuinely public, same as Wishlist (UI-02) — a guest can
      // build a cart before creating an account (see CartProvider's
      // guest/account dual mode). Checkout itself is the protected step.
      { path: 'cart', element: <CartPage /> },
      { path: 'artists/:artistId', element: <ArtistProfilePage /> },
      { path: 'artworks/:artworkId', element: <ArtworkDetailPage /> },
      {
        element: <RequireAuth />,
        children: [
          { path: 'account', element: <AccountPage /> },
          { path: 'checkout', element: <CheckoutPage /> },
          { path: 'checkout/confirmation/:orderId', element: <OrderConfirmationPage /> },
          { path: 'orders', element: <OrdersPage /> },
          { path: 'orders/:orderId', element: <OrderDetailsPage /> },
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
          {
            element: <RequireRole allow={['ADMIN', 'SUPER_ADMIN']} />,
            children: [{ path: 'admin', element: <AdminPage /> }],
          },
        ],
      },
      // Catch-all — must stay last so every more specific route above wins;
      // react-router's own specificity ranking doesn't depend on this order,
      // but readability does. Renders inside AppShell like every other page
      // (nav, AI launcher) rather than a bare, unstyled error.
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
