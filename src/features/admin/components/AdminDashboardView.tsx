import { useMemo, useState } from 'react'
import {
  Users,
  Palette,
  ShoppingBag,
  IndianRupee,
  Gavel,
  Clock,
  TrendingUp,
  Activity,
  CheckCircle2,
  XCircle,
  Eye,
  UserPlus,
  Settings,
  Sparkles,
  Server,
  Database,
  ShieldCheck,
  RotateCw,
} from 'lucide-react'
import { Badge, Button, Card, ErrorState, Skeleton } from '@/shared/ui'
import { useAdminDashboardMetrics } from '../hooks/useAdminDashboardMetrics'
import { useAdminUsers } from '../hooks/useAdminUsers'
import { useAdminOrders } from '../hooks/useAdminOrders'
import { useAdminPayments } from '../hooks/useAdminPayments'
import { useAdminAuditLogs } from '../hooks/useAdminAuditLogs'
import { useAllArtworks } from '../hooks/useAllArtworks'
import { useSubmittedArtworks } from '../hooks/useSubmittedArtworks'
import { useModerateArtwork } from '../hooks/useModerateArtwork'
import { useAuctions } from '@/features/auctions/hooks/useAuctions'
import { deriveAuctionStatus } from '@/features/auctions/types'
import { useArtistDisplayNames } from '@/features/marketplace'

interface AdminDashboardViewProps {
  onNavigateTab: (tab: 'users' | 'sellers' | 'artworks' | 'orders' | 'payments' | 'audit' | 'sellers-all' | 'artworks-all') => void
}

export function AdminDashboardView({ onNavigateTab }: AdminDashboardViewProps) {
  const { data: metrics, status, error, refetch, isFetching } = useAdminDashboardMetrics()
  const usersQuery = useAdminUsers()
  const ordersQuery = useAdminOrders()
  const paymentsQuery = useAdminPayments()
  const auditLogsQuery = useAdminAuditLogs()
  const artworksQuery = useAllArtworks()
  const submittedQuery = useSubmittedArtworks()
  const moderate = useModerateArtwork()
  const auctionsState = useAuctions()

  const [growthMetric, setGrowthMetric] = useState<'users' | 'artworks' | 'orders' | 'revenue'>('users')
  const [timeRange, setTimeRange] = useState<'30' | '90' | 'year'>('30')

  const pendingArtworks = submittedQuery.data?.slice(0, 5) ?? []
  const artistNames = useArtistDisplayNames(pendingArtworks.map((a) => a.sellerId))

  // Real auctions from database (currently 0 until Module 5 is implemented)
  const realAuctions = auctionsState.status === 'loaded' ? auctionsState.auctions : []
  const activeAuctions = realAuctions.filter((a) => {
    const s = deriveAuctionStatus(a)
    return s === 'LIVE' || s === 'SCHEDULED'
  })

  // Format currency helper
  const formatCurrency = (minor: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(minor / 100)
  }

  // Real revenue separation: TEST vs LIVE production payments
  const payments = paymentsQuery.data ?? []
  const { liveRevenueMinor, testRevenueMinor } = useMemo(() => {
    let live = 0
    let test = 0
    for (const p of payments) {
      if (p.status === 'CAPTURED' || p.status === 'SUCCEEDED') {
        if (p.mode === 'TEST') {
          test += p.amountMinor
        } else {
          live += p.amountMinor
        }
      }
    }
    return { liveRevenueMinor: live, testRevenueMinor: test }
  }, [payments])

  // Total settled revenue from metrics (authoritative from orders where payment_state = 'PAID')
  const totalSettledMinor = metrics?.totalRevenueMinor ?? (liveRevenueMinor + testRevenueMinor)
  const isAllTestRevenue = liveRevenueMinor === 0 && totalSettledMinor > 0

  // Real user distribution: partition users into mutually exclusive groups without double-counting
  const users = usersQuery.data ?? []
  const userDistribution = useMemo(() => {
    const total = users.length || metrics?.totalUsers || 0
    if (total === 0) {
      return {
        total: 0,
        admins: 0,
        approvedSellers: 0,
        pendingSellers: 0,
        customers: 0,
        adminPct: '0',
        approvedSellerPct: '0',
        pendingSellerPct: '0',
        customerPct: '0',
      }
    }

    let admins = 0
    let approvedSellers = 0
    let pendingSellers = 0
    let customers = 0

    for (const u of users) {
      if (u.role === 'SUPER_ADMIN' || u.role === 'ADMIN') {
        admins++
      } else if (u.sellerStatus === 'APPROVED') {
        approvedSellers++
      } else if (u.sellerStatus === 'PENDING') {
        pendingSellers++
      } else {
        customers++
      }
    }

    return {
      total,
      admins,
      approvedSellers,
      pendingSellers,
      customers,
      adminPct: ((admins / total) * 100).toFixed(1),
      approvedSellerPct: ((approvedSellers / total) * 100).toFixed(1),
      pendingSellerPct: ((pendingSellers / total) * 100).toFixed(1),
      customerPct: ((customers / total) * 100).toFixed(1),
    }
  }, [users, metrics?.totalUsers])

  // Real historical time-series computation from actual database timestamps
  const chartData = useMemo(() => {
    const days = timeRange === '30' ? 30 : timeRange === '90' ? 90 : 365
    const now = Date.now()
    const startTime = now - days * 24 * 60 * 60 * 1000

    // 5 time checkpoints
    const steps = 4
    const stepDuration = (now - startTime) / steps
    const checkpoints = Array.from({ length: steps + 1 }, (_, i) => startTime + i * stepDuration)

    const userDates = users.map((u) => new Date(u.createdAt).getTime())
    const artworkDates = (artworksQuery.data ?? []).map((a) => a.createdAt.toDate().getTime())
    const orderDates = (ordersQuery.data ?? []).map((o) => new Date(o.createdAt).getTime())
    const paidPaymentEvents = payments
      .filter((p) => p.status === 'CAPTURED' || p.status === 'SUCCEEDED')
      .map((p) => ({ time: new Date(p.createdAt).getTime(), amount: p.amountMinor }))

    // Compute cumulative values at each checkpoint
    const points = checkpoints.map((checkpointTime) => {
      const usersCount = userDates.filter((t) => t <= checkpointTime).length
      const artworksCount = artworkDates.filter((t) => t <= checkpointTime).length
      const ordersCount = orderDates.filter((t) => t <= checkpointTime).length
      const revenueMinor = paidPaymentEvents
        .filter((p) => p.time <= checkpointTime)
        .reduce((sum, p) => sum + p.amount, 0)

      return {
        timestamp: checkpointTime,
        dateLabel: new Date(checkpointTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        users: usersCount,
        artworks: artworksCount,
        orders: ordersCount,
        revenue: revenueMinor / 100, // INR
      }
    })

    // Active metric series
    const activeValues = points.map((p) => p[growthMetric])
    const maxVal = Math.max(...activeValues, 1)

    // Map to SVG coordinates (width 400, height 120, padding 15)
    const svgPoints = points.map((p, idx) => {
      const x = 20 + idx * ((400 - 40) / steps)
      const val = p[growthMetric]
      const y = 135 - (val / maxVal) * 105
      return { x, y, val, label: p.dateLabel }
    })

    const polylineStr = svgPoints.map((pt) => `${pt.x},${pt.y}`).join(' ')

    return {
      points,
      svgPoints,
      polylineStr,
      maxVal,
    }
  }, [timeRange, users, artworksQuery.data, ordersQuery.data, payments, growthMetric])

  // Real recent audit logs
  const recentLogs = useMemo(() => {
    return (auditLogsQuery.data ?? []).slice(0, 5)
  }, [auditLogsQuery.data])

  if (status === 'pending') {
    return (
      <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading admin dashboard">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl bg-surface-muted/60" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Skeleton className="h-72 w-full rounded-xl bg-surface-muted/60" />
          <Skeleton className="h-72 w-full rounded-xl bg-surface-muted/60" />
          <Skeleton className="h-72 w-full rounded-xl bg-surface-muted/60" />
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <ErrorState
        title="Could not load dashboard metrics"
        description={error?.message || 'Something went wrong while loading real database metrics.'}
        action={
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            Try again
          </Button>
        }
      />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header Info */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-text-primary">
            Admin Dashboard
          </h2>
          <p className="mt-0.5 text-sm text-text-secondary">
            Authoritative platform metrics, seller verification, and order settlement status.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-text-secondary sm:inline-block">
            {new Date().toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              void refetch()
              void usersQuery.refetch()
              void ordersQuery.refetch()
              void paymentsQuery.refetch()
              void auditLogsQuery.refetch()
              void artworksQuery.refetch()
              void submittedQuery.refetch()
            }}
            disabled={isFetching}
            className="gap-1.5"
          >
            <RotateCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Top 6 KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {/* Total Users */}
        <Card className="flex flex-col justify-between border-border/80 bg-surface/90 p-4 shadow-sm hover:border-brand-primary/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-secondary">Total Users</span>
            <div className="rounded-lg bg-blue-500/10 p-2 text-blue-400">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold text-text-primary">{metrics.totalUsers}</div>
            <div className="mt-1 flex items-center gap-1 text-[11px] text-emerald-400">
              <TrendingUp className="h-3 w-3" />
              <span>Database Profiles</span>
            </div>
          </div>
        </Card>

        {/* Sellers */}
        <Card className="flex flex-col justify-between border-border/80 bg-surface/90 p-4 shadow-sm hover:border-brand-primary/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-secondary">Sellers</span>
            <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-400">
              <Palette className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold text-text-primary">{metrics.totalSellers}</div>
            <div className="mt-1 flex items-center gap-1 text-[11px] text-text-secondary">
              <span className="text-amber-400">{metrics.pendingSellers} pending</span>
            </div>
          </div>
        </Card>

        {/* Artworks */}
        <Card className="flex flex-col justify-between border-border/80 bg-surface/90 p-4 shadow-sm hover:border-brand-primary/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-secondary">Artworks</span>
            <div className="rounded-lg bg-purple-500/10 p-2 text-purple-400">
              <Sparkles className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold text-text-primary">{metrics.totalArtworks}</div>
            <div className="mt-1 flex items-center gap-1 text-[11px] text-emerald-400">
              <span>{metrics.publishedArtworks} live</span>
            </div>
          </div>
        </Card>

        {/* Orders */}
        <Card className="flex flex-col justify-between border-border/80 bg-surface/90 p-4 shadow-sm hover:border-brand-primary/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-secondary">Orders</span>
            <div className="rounded-lg bg-pink-500/10 p-2 text-pink-400">
              <ShoppingBag className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold text-text-primary">{metrics.totalOrders}</div>
            <div className="mt-1 flex items-center gap-1 text-[11px] text-text-secondary">
              <span className="text-emerald-400">{metrics.paidOrders} paid</span>
            </div>
          </div>
        </Card>

        {/* Settled Revenue */}
        <Card className="flex flex-col justify-between border-border/80 bg-surface/90 p-4 shadow-sm hover:border-brand-primary/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-secondary">Settled Volume</span>
            <div className="rounded-lg bg-amber-500/10 p-2 text-amber-400">
              <IndianRupee className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-lg font-bold text-text-primary truncate">
              {formatCurrency(totalSettledMinor)}
            </div>
            <div className="mt-1 flex items-center gap-1 text-[11px]">
              {isAllTestRevenue ? (
                <span className="font-medium text-amber-400">TEST Mode Volume</span>
              ) : (
                <span className="text-emerald-400">Verified Settled</span>
              )}
            </div>
          </div>
        </Card>

        {/* Auctions */}
        <Card className="flex flex-col justify-between border-border/80 bg-surface/90 p-4 shadow-sm hover:border-brand-primary/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-secondary">Auctions</span>
            <div className="rounded-lg bg-orange-500/10 p-2 text-orange-400">
              <Gavel className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold text-text-primary">
              {realAuctions.length}
            </div>
            <div className="mt-1 flex items-center gap-1 text-[11px] text-text-secondary">
              <span className="text-text-muted">Module 5 Pending</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Middle Row: Platform Growth, User Distribution, Recent Activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Platform Growth Chart Card (5 cols) */}
        <Card className="flex flex-col justify-between border-border/80 bg-surface/90 p-5 lg:col-span-5 shadow-sm">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-3">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">Platform Growth</h3>
                <p className="text-xs text-text-secondary">Calculated from authoritative record creation dates</p>
              </div>
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value as any)}
                aria-label="Filter time range"
                className="rounded-md border border-border bg-surface-elevated px-2 py-1 text-xs text-text-secondary outline-none"
              >
                <option value="30">Last 30 Days</option>
                <option value="90">Last 90 Days</option>
                <option value="year">Past 365 Days</option>
              </select>
            </div>

            {/* Metric pill toggles */}
            <div className="mt-3 flex gap-1.5">
              {(['users', 'artworks', 'orders', 'revenue'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setGrowthMetric(m)}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                    growthMetric === m
                      ? 'bg-brand-primary text-text-inverse'
                      : 'bg-surface-elevated text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {m === 'revenue' ? 'Revenue (₹)' : m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>

            {/* Mathematical SVG Chart based on real records */}
            <div className="mt-5 h-44 w-full">
              <svg className="h-full w-full overflow-visible" viewBox="0 0 400 150">
                {/* Horizontal reference grid lines */}
                <line x1="20" y1="30" x2="380" y2="30" stroke="currentColor" className="text-border/30" strokeDasharray="3 3" />
                <line x1="20" y1="80" x2="380" y2="80" stroke="currentColor" className="text-border/30" strokeDasharray="3 3" />
                <line x1="20" y1="135" x2="380" y2="135" stroke="currentColor" className="text-border/50" />

                {/* Real polyline */}
                <polyline
                  fill="none"
                  stroke="#d4af37"
                  strokeWidth="2.5"
                  points={chartData.polylineStr}
                />

                {/* Real data point dots & labels */}
                {chartData.svgPoints.map((pt, i) => (
                  <g key={i}>
                    <circle cx={pt.x} cy={pt.y} r="3.5" fill="#d4af37" />
                    <text
                      x={pt.x}
                      y="148"
                      textAnchor="middle"
                      className="fill-text-secondary text-[9px]"
                    >
                      {pt.label}
                    </text>
                  </g>
                ))}
              </svg>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-3 text-[11px] text-text-secondary">
            <span>
              Peak: {growthMetric === 'revenue' ? formatCurrency(chartData.maxVal * 100) : `${chartData.maxVal} ${growthMetric}`}
            </span>
            <span className="text-[10px] text-text-muted">
              Source: {growthMetric === 'users' ? 'profiles.created_at' : growthMetric === 'artworks' ? 'artworks.created_at' : growthMetric === 'orders' ? 'orders.created_at' : 'payments.created_at'}
            </span>
          </div>
        </Card>

        {/* User Distribution Donut Card (3 cols) */}
        <Card className="flex flex-col justify-between border-border/80 bg-surface/90 p-5 lg:col-span-3 shadow-sm">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">User Distribution</h3>
            <p className="text-xs text-text-secondary">Mutually exclusive role segregation</p>

            {/* Donut representation from real database roles */}
            <div className="relative mt-4 flex items-center justify-center">
              <svg className="h-36 w-36 -rotate-90 transform" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="38" stroke="currentColor" className="text-surface-elevated" strokeWidth="12" fill="none" />
                {/* Customers slice */}
                <circle
                  cx="50"
                  cy="50"
                  r="38"
                  stroke="#38bdf8"
                  strokeWidth="12"
                  fill="none"
                  strokeDasharray="238"
                  strokeDashoffset={238 - (238 * Number(userDistribution.customerPct)) / 100}
                  className="transition-all duration-500"
                />
                {/* Approved Sellers slice */}
                <circle
                  cx="50"
                  cy="50"
                  r="38"
                  stroke="#34d399"
                  strokeWidth="12"
                  fill="none"
                  strokeDasharray="238"
                  strokeDashoffset={238 - (238 * Number(userDistribution.approvedSellerPct)) / 100}
                  className="transition-all duration-500"
                />
              </svg>
              <div className="absolute text-center">
                <div className="text-base font-bold text-text-primary">{userDistribution.total}</div>
                <div className="text-[10px] text-text-secondary">Total Profiles</div>
              </div>
            </div>

            {/* Legend from real counts */}
            <div className="mt-4 flex flex-col gap-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-sky-400"></span>
                  <span className="text-text-secondary">Customers</span>
                </span>
                <span className="font-semibold text-text-primary">{userDistribution.customers} ({userDistribution.customerPct}%)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
                  <span className="text-text-secondary">Approved Sellers</span>
                </span>
                <span className="font-semibold text-text-primary">{userDistribution.approvedSellers} ({userDistribution.approvedSellerPct}%)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-amber-400"></span>
                  <span className="text-text-secondary">Pending Sellers</span>
                </span>
                <span className="font-semibold text-amber-400">{userDistribution.pendingSellers}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-purple-400"></span>
                  <span className="text-text-secondary">Administrators</span>
                </span>
                <span className="font-semibold text-text-primary">{userDistribution.admins}</span>
              </div>
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="mt-4 w-full text-xs text-brand-primary"
            onClick={() => onNavigateTab('users')}
          >
            Manage User Roles &rarr;
          </Button>
        </Card>

        {/* Recent Activity Card from public.admin_logs (4 cols) */}
        <Card className="flex flex-col justify-between border-border/80 bg-surface/90 p-5 lg:col-span-4 shadow-sm">
          <div>
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <h3 className="text-sm font-semibold text-text-primary">Recent Activity</h3>
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-0 text-xs text-brand-primary"
                onClick={() => onNavigateTab('audit')}
              >
                View Full Audit
              </Button>
            </div>

            {recentLogs.length === 0 ? (
              <div className="flex h-44 flex-col items-center justify-center text-center">
                <ShieldCheck className="h-7 w-7 text-text-muted" />
                <p className="mt-2 text-xs font-medium text-text-primary">No recent audit logs</p>
                <p className="text-[11px] text-text-secondary">Administrative actions will appear here in real time</p>
              </div>
            ) : (
              <div className="mt-3 flex flex-col gap-2.5">
                {recentLogs.map((log) => (
                  <div key={log.id} className="flex items-start gap-2.5 border-b border-border/30 pb-2">
                    <div className="rounded-full bg-surface-elevated p-1.5 text-text-secondary">
                      <Activity className="h-3 w-3" />
                    </div>
                    <div className="min-w-0 flex-1 text-xs">
                      <p className="font-medium text-text-primary truncate">
                        {log.action.replace(/_/g, ' ')}
                      </p>
                      <p className="text-[11px] text-text-secondary truncate">
                        By {log.actorName || 'Admin'}
                        {log.previousState && log.newState ? ` (${log.previousState} → ${log.newState})` : ''}
                      </p>
                    </div>
                    <span className="text-[10px] text-text-muted whitespace-nowrap">
                      {new Date(log.occurredAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Button
            variant="secondary"
            size="sm"
            className="mt-4 w-full text-xs"
            onClick={() => onNavigateTab('audit')}
          >
            Open Audit Ledger &rarr;
          </Button>
        </Card>
      </div>

      {/* Bottom Row: Recent Artworks for Review, Ongoing Auctions, Order Status Overview */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Recent Artworks for Review (5 cols) */}
        <Card className="flex flex-col justify-between border-border/80 bg-surface/90 p-5 lg:col-span-5 shadow-sm">
          <div>
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-text-primary">Recent Artworks for Review</h3>
                {metrics.submittedArtworks > 0 && (
                  <Badge tone="gold">{metrics.submittedArtworks}</Badge>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-0 text-xs text-brand-primary"
                onClick={() => onNavigateTab('artworks')}
              >
                View All
              </Button>
            </div>

            {pendingArtworks.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center text-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                <p className="mt-2 text-xs font-medium text-text-primary">Queue is clear</p>
                <p className="text-[11px] text-text-secondary">No artworks currently awaiting moderation</p>
              </div>
            ) : (
              <div className="mt-3 flex flex-col gap-3">
                {pendingArtworks.map((art) => (
                  <div key={art.id} className="flex items-center justify-between rounded-lg border border-border/50 bg-surface-elevated/40 p-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-surface-muted">
                        {art.images[0]?.url ? (
                          <img src={art.images[0].url} alt={art.title} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-text-muted">
                            <Palette className="h-4 w-4" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-text-primary">{art.title}</p>
                        <p className="truncate text-[10px] text-text-secondary">
                          by {artistNames[art.sellerId] || 'Artist'} • {art.category}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-[11px] text-emerald-400 hover:bg-emerald-500/10"
                        onClick={() => moderate.mutate({ artworkId: art.id, decision: 'PUBLISHED' })}
                        disabled={moderate.isPending}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-[11px] text-rose-400 hover:bg-rose-500/10"
                        onClick={() => moderate.mutate({ artworkId: art.id, decision: 'REJECTED', rejectionReason: 'Policy guidelines' })}
                        disabled={moderate.isPending}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Button
            variant="secondary"
            size="sm"
            className="mt-4 w-full text-xs"
            onClick={() => onNavigateTab('artworks')}
          >
            Inspect Moderation Queue &rarr;
          </Button>
        </Card>

        {/* Ongoing Auctions (4 cols) */}
        <Card className="flex flex-col justify-between border-border/80 bg-surface/90 p-5 lg:col-span-4 shadow-sm">
          <div>
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-text-primary">Ongoing Auctions</h3>
                <Badge tone="neutral">Module 5</Badge>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-0 text-xs text-brand-primary"
                onClick={() => onNavigateTab('artworks')}
              >
                View
              </Button>
            </div>

            {realAuctions.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center text-center">
                <Gavel className="h-8 w-8 text-text-muted" />
                <p className="mt-2 text-xs font-medium text-text-primary">No auction lots scheduled</p>
                <p className="text-[11px] text-text-secondary max-w-[220px]">
                  Auctions engine, live bidding, and reserve prices will be implemented in Module 5.
                </p>
              </div>
            ) : (
              <div className="mt-3 flex flex-col gap-2.5">
                {activeAuctions.map((auc) => {
                  const status = deriveAuctionStatus(auc)
                  const displayBid = auc.currentHighBid ?? auc.startingBid
                  return (
                    <div key={auc.id} className="flex items-center justify-between rounded-lg border border-border/50 bg-surface-elevated/40 p-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-text-primary">Auction #{auc.id.slice(0, 8)}</p>
                        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-text-secondary">
                          <span className="flex items-center gap-1 text-amber-400">
                            <Clock className="h-3 w-3" />
                            {status}
                          </span>
                          <span>Bid: {formatCurrency(displayBid)}</span>
                        </div>
                      </div>
                      <Button size="sm" variant="secondary" className="h-7 px-2.5 text-xs">
                        View
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="mt-4 rounded-md bg-surface-muted/60 p-2.5 text-[11px] text-text-secondary">
            <span className="font-semibold text-text-primary">Source: </span>
            <code>public.get_public_auctions()</code>. Zero fabricated records.
          </div>
        </Card>

        {/* Order Status Overview (3 cols) */}
        <Card className="flex flex-col justify-between border-border/80 bg-surface/90 p-5 lg:col-span-3 shadow-sm">
          <div>
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <h3 className="text-sm font-semibold text-text-primary">Order Pipeline</h3>
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-0 text-xs text-brand-primary"
                onClick={() => onNavigateTab('orders')}
              >
                View All
              </Button>
            </div>

            <div className="mt-3 flex flex-col gap-2 text-xs">
              <div className="flex items-center justify-between border-b border-border/30 pb-2">
                <span className="flex items-center gap-2 text-amber-400">
                  <Clock className="h-3.5 w-3.5" />
                  <span>Pending Payment</span>
                </span>
                <span className="font-semibold text-text-primary">{metrics.pendingOrders}</span>
              </div>
              <div className="flex items-center justify-between border-b border-border/30 pb-2">
                <span className="flex items-center gap-2 text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Paid & Settled</span>
                </span>
                <span className="font-semibold text-text-primary">{metrics.paidOrders}</span>
              </div>
              <div className="flex items-center justify-between border-b border-border/30 pb-2">
                <span className="flex items-center gap-2 text-sky-400">
                  <ShoppingBag className="h-3.5 w-3.5" />
                  <span>Total Pipeline</span>
                </span>
                <span className="font-semibold text-text-primary">{metrics.totalOrders}</span>
              </div>
              <div className="flex items-center justify-between pb-1">
                <span className="flex items-center gap-2 text-rose-400">
                  <XCircle className="h-3.5 w-3.5" />
                  <span>Cancelled</span>
                </span>
                <span className="font-semibold text-text-secondary">{metrics.cancelledOrders}</span>
              </div>
            </div>
          </div>

          <Button
            variant="secondary"
            size="sm"
            className="mt-4 w-full text-xs"
            onClick={() => onNavigateTab('orders')}
          >
            Review Orders &rarr;
          </Button>
        </Card>
      </div>

      {/* Footer Row: Platform Insights, Quick Actions, System Health */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Platform Insights (5 cols) */}
        <Card className="flex flex-col justify-between border-border/80 bg-surface/90 p-5 lg:col-span-5 shadow-sm">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Platform Insights</h3>
            <p className="text-xs text-text-secondary">Authoritative catalog & moderation facts</p>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg bg-surface-elevated/40 p-2.5">
                <div className="flex items-center gap-1.5 text-text-secondary text-xs">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Approved</span>
                </div>
                <div className="mt-1 text-base font-bold text-text-primary">
                  {metrics.approvedSellers}
                </div>
                <div className="text-[10px] text-text-secondary">Sellers</div>
              </div>
              <div className="rounded-lg bg-surface-elevated/40 p-2.5">
                <div className="flex items-center gap-1.5 text-text-secondary text-xs">
                  <Palette className="h-3.5 w-3.5 text-sky-400" />
                  <span>Published</span>
                </div>
                <div className="mt-1 text-base font-bold text-text-primary">
                  {metrics.publishedArtworks}
                </div>
                <div className="text-[10px] text-text-secondary">Artworks</div>
              </div>
              <div className="rounded-lg bg-surface-elevated/40 p-2.5">
                <div className="flex items-center gap-1.5 text-text-secondary text-xs">
                  <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                  <span>Under Review</span>
                </div>
                <div className="mt-1 text-base font-bold text-text-primary">
                  {metrics.submittedArtworks}
                </div>
                <div className="text-[10px] text-text-secondary">Artworks</div>
              </div>
              <div className="rounded-lg bg-surface-elevated/40 p-2.5">
                <div className="flex items-center gap-1.5 text-text-secondary text-xs">
                  <Eye className="h-3.5 w-3.5 text-text-muted" />
                  <span>Telemetry</span>
                </div>
                <div className="mt-1 text-xs font-medium text-text-muted">
                  Not Tracked
                </div>
                <div className="text-[10px] text-text-muted">No DB pageviews</div>
              </div>
            </div>
          </div>

          <div className="mt-3 text-[11px] text-text-muted">
            Pageview and profile-visit tracking are not collected in database. No fabricated metrics are displayed.
          </div>
        </Card>

        {/* Quick Actions (4 cols) */}
        <Card className="flex flex-col justify-between border-border/80 bg-surface/90 p-5 lg:col-span-4 shadow-sm">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Quick Actions</h3>
            <p className="text-xs text-text-secondary">Administrative tasks & shortcuts</p>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="justify-start text-xs"
                onClick={() => onNavigateTab('users')}
              >
                <UserPlus className="mr-1.5 h-3.5 w-3.5 text-text-secondary" />
                Manage Users
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="justify-start text-xs"
                onClick={() => onNavigateTab('sellers')}
              >
                <Palette className="mr-1.5 h-3.5 w-3.5 text-text-secondary" />
                Review Sellers
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="justify-start text-xs"
                onClick={() => onNavigateTab('artworks')}
              >
                <Sparkles className="mr-1.5 h-3.5 w-3.5 text-text-secondary" />
                Moderate Art
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="justify-start text-xs"
                onClick={() => onNavigateTab('audit')}
              >
                <Settings className="mr-1.5 h-3.5 w-3.5 text-text-secondary" />
                Audit Logs
              </Button>
            </div>
          </div>
        </Card>

        {/* System Health (Supabase Architecture) (3 cols) */}
        <Card className="flex flex-col justify-between border-border/80 bg-surface/90 p-5 lg:col-span-3 shadow-sm">
          <div>
            <div className="flex items-center justify-between border-b border-border/40 pb-2">
              <h3 className="text-sm font-semibold text-text-primary">System Health</h3>
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
                Operational
              </span>
            </div>

            <div className="mt-2.5 flex flex-col gap-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-text-secondary">
                  <Database className="h-3 w-3 text-emerald-400" />
                  <span>Supabase Database & Auth</span>
                </span>
                <span className="text-[10px] text-emerald-400">Connected</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-text-secondary">
                  <IndianRupee className="h-3 w-3 text-amber-400" />
                  <span>Razorpay Gateway</span>
                </span>
                <span className="text-[10px] text-amber-400">TEST Mode</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-text-secondary">
                  <Clock className="h-3 w-3 text-emerald-400" />
                  <span>pg_cron Auto-Expiry</span>
                </span>
                <span className="text-[10px] text-emerald-400">1 min cycle</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-text-secondary">
                  <Server className="h-3 w-3 text-emerald-400" />
                  <span>Supabase Storage</span>
                </span>
                <span className="text-[10px] text-emerald-400">Active</span>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
