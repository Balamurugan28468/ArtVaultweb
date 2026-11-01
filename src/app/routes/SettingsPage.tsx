import {
  Bell,
  CheckCircle2,
  Globe,
  Save,
  Shield,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { updateUserProfile, useUserProfile } from '@/features/account'
import { Avatar, Button, Card, PageHeader } from '@/shared/ui'

interface SettingsState {
  orderUpdates: boolean
  auctionAlerts: boolean
  artistReleases: boolean
  publicReviews: boolean
  anonymousBidding: boolean
  currency: 'INR' | 'USD' | 'EUR'
}

const SETTINGS_KEY = 'artvault_user_preferences'

function loadSavedSettings(): SettingsState {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) return JSON.parse(raw) as SettingsState
  } catch {
    // fallback
  }
  return {
    orderUpdates: true,
    auctionAlerts: true,
    artistReleases: false,
    publicReviews: true,
    anonymousBidding: true,
    currency: 'INR',
  }
}

export function SettingsPage() {
  const profileState = useUserProfile()
  const profile = profileState.status === 'loaded' ? profileState.profile : null

  const [displayName, setDisplayName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [bio, setBio] = useState('')
  const [profileInitialized, setProfileInitialized] = useState(false)

  const [preferences, setPreferences] = useState<SettingsState>(loadSavedSettings)
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileSuccess, setProfileSuccess] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)

  const [prefSuccess, setPrefSuccess] = useState(false)

  // Initialize form when profile loads
  if (profile && !profileInitialized) {
    setDisplayName(profile.displayName || '')
    setPhoneNumber(profile.phoneNumber || '')
    setBio(profile.bio || '')
    setProfileInitialized(true)
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profile) return

    setSavingProfile(true)
    setProfileError(null)

    try {
      await updateUserProfile(profile.uid, {
        displayName: displayName.trim(),
        phoneNumber: phoneNumber.trim() || null,
        bio: bio.trim() || null,
      })
      setProfileSuccess(true)
      setTimeout(() => setProfileSuccess(false), 3000)
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Failed to update profile settings.')
    } finally {
      setSavingProfile(false)
    }
  }

  const handleTogglePref = (key: keyof SettingsState) => {
    setPreferences((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
      setPrefSuccess(true)
      setTimeout(() => setPrefSuccess(false), 2000)
      return next
    })
  }

  const handleCurrencyChange = (curr: 'INR' | 'USD' | 'EUR') => {
    setPreferences((prev) => {
      const next = { ...prev, currency: curr }
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
      setPrefSuccess(true)
      setTimeout(() => setPrefSuccess(false), 2000)
      return next
    })
  }

  return (
    <section className="flex flex-col gap-6">
      <div>
        <Link to="/account" className="text-sm text-text-secondary hover:text-text-primary hover:underline">
          ← Back to Account
        </Link>
        <PageHeader
          title="Account Settings"
          description="Manage your personal profile, notification preferences, and privacy controls."
        />
      </div>

      {prefSuccess && (
        <div role="status" className="flex items-center gap-2 rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
          <span>Preferences updated.</span>
        </div>
      )}

      {/* Profile Details Form */}
      <Card className="flex flex-col gap-5 p-5">
        <div className="flex items-center gap-3">
          <Avatar name={profile?.displayName || 'Collector'} size="md" />
          <div>
            <h3 className="text-sm font-medium text-text-primary">Collector Profile</h3>
            <p className="text-xs text-text-muted">Public bio, display name, and verified contact</p>
          </div>
        </div>

        {profileSuccess && (
          <div role="status" className="flex items-center gap-2 rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-400">
            <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
            <span>Profile information updated successfully!</span>
          </div>
        )}

        {profileError && (
          <div role="alert" className="rounded-lg bg-danger/10 p-3 text-sm text-danger">
            {profileError}
          </div>
        )}

        <form onSubmit={handleSaveProfile} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="settings-name" className="text-xs font-medium text-text-secondary">
                Display Name
              </label>
              <input
                id="settings-name"
                type="text"
                required
                maxLength={60}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Ramesh V"
                className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-visible:border-accent-gold focus-visible:outline-none"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="settings-phone" className="text-xs font-medium text-text-secondary">
                Phone Number
              </label>
              <input
                id="settings-phone"
                type="tel"
                maxLength={20}
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+91 98765 43210"
                className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-visible:border-accent-gold focus-visible:outline-none"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="settings-bio" className="text-xs font-medium text-text-secondary">
              Collector Bio
            </label>
            <textarea
              id="settings-bio"
              rows={3}
              maxLength={300}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell artists and curators about the art styles and media you collect..."
              className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-visible:border-accent-gold focus-visible:outline-none"
            />
          </div>

          <Button type="submit" variant="gold" size="sm" disabled={savingProfile} className="self-start">
            <Save aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
            {savingProfile ? 'Saving Changes…' : 'Save Profile'}
          </Button>
        </form>
      </Card>

      {/* Notification Preferences */}
      <Card className="flex flex-col gap-4 p-5">
        <div className="flex items-center gap-2.5">
          <Bell aria-hidden="true" className="h-5 w-5 text-accent-gold" />
          <h3 className="font-medium text-sm text-text-primary">Notification Subscriptions</h3>
        </div>
        <div className="flex flex-col divide-y divide-border text-xs">
          <label className="flex items-center justify-between py-3 cursor-pointer">
            <div>
              <p className="font-medium text-text-primary text-sm">Order Dispatches & Tracking</p>
              <p className="text-text-muted">Receive alerts when artwork is packaged, shipped, or delivered.</p>
            </div>
            <input
              type="checkbox"
              checked={preferences.orderUpdates}
              onChange={() => handleTogglePref('orderUpdates')}
              className="h-4 w-4 rounded border-border accent-accent-gold"
            />
          </label>

          <label className="flex items-center justify-between py-3 cursor-pointer">
            <div>
              <p className="font-medium text-text-primary text-sm">Live Auction Bidding Alerts</p>
              <p className="text-text-muted">Notifies you if you are outbid or when a watched lot is closing.</p>
            </div>
            <input
              type="checkbox"
              checked={preferences.auctionAlerts}
              onChange={() => handleTogglePref('auctionAlerts')}
              className="h-4 w-4 rounded border-border accent-accent-gold"
            />
          </label>

          <label className="flex items-center justify-between py-3 cursor-pointer">
            <div>
              <p className="font-medium text-text-primary text-sm">Artist Drops & Weekly Top-5</p>
              <p className="text-text-muted">Receive notifications when verified artists publish new originals.</p>
            </div>
            <input
              type="checkbox"
              checked={preferences.artistReleases}
              onChange={() => handleTogglePref('artistReleases')}
              className="h-4 w-4 rounded border-border accent-accent-gold"
            />
          </label>
        </div>
      </Card>

      {/* Privacy & Auction Anonymity */}
      <Card className="flex flex-col gap-4 p-5">
        <div className="flex items-center gap-2.5">
          <Shield aria-hidden="true" className="h-5 w-5 text-accent-gold" />
          <h3 className="font-medium text-sm text-text-primary">Privacy & Identity Controls</h3>
        </div>
        <div className="flex flex-col divide-y divide-border text-xs">
          <label className="flex items-center justify-between py-3 cursor-pointer">
            <div>
              <p className="font-medium text-text-primary text-sm">Anonymous Live Auction Bidding</p>
              <p className="text-text-muted">Hides your username on public auction screens, displaying "Collector #...".</p>
            </div>
            <input
              type="checkbox"
              checked={preferences.anonymousBidding}
              onChange={() => handleTogglePref('anonymousBidding')}
              className="h-4 w-4 rounded border-border accent-accent-gold"
            />
          </label>

          <label className="flex items-center justify-between py-3 cursor-pointer">
            <div>
              <p className="font-medium text-text-primary text-sm">Show Name on Verified Reviews</p>
              <p className="text-text-muted">Display your display name alongside your published artwork reviews.</p>
            </div>
            <input
              type="checkbox"
              checked={preferences.publicReviews}
              onChange={() => handleTogglePref('publicReviews')}
              className="h-4 w-4 rounded border-border accent-accent-gold"
            />
          </label>
        </div>
      </Card>

      {/* Currency & Locale */}
      <Card className="flex flex-col gap-3 p-5">
        <div className="flex items-center gap-2.5">
          <Globe aria-hidden="true" className="h-5 w-5 text-accent-gold" />
          <h3 className="font-medium text-sm text-text-primary">Display Currency</h3>
        </div>
        <div className="flex items-center gap-2">
          {(['INR', 'USD', 'EUR'] as const).map((curr) => (
            <button
              key={curr}
              type="button"
              onClick={() => handleCurrencyChange(curr)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${
                preferences.currency === curr
                  ? 'border-accent-gold bg-accent-gold/15 text-accent-gold font-semibold'
                  : 'border-border bg-surface hover:border-border-strong text-text-secondary'
              }`}
            >
              {curr === 'INR' ? '₹ INR (Rupees)' : curr === 'USD' ? '$ USD (Dollar)' : '€ EUR (Euro)'}
            </button>
          ))}
        </div>
      </Card>
    </section>
  )
}

