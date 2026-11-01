import {
  Banknote,
  CheckCircle2,
  CreditCard,
  QrCode,
  ShieldAlert,
  Smartphone,
  Sparkles,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { testPaymentsAvailable } from '@/features/payments/api/razorpay'
import { Button, Card, PageHeader } from '@/shared/ui'

export type PreferredPaymentMethod = 'UPI_GPAY' | 'UPI_PHONEPE' | 'CARDS' | 'COD'

const PREFERRED_KEY = 'artvault_preferred_payment_method'

export function PaymentMethodsPage() {
  const [preferred, setPreferred] = useState<PreferredPaymentMethod>(() => {
    return (localStorage.getItem(PREFERRED_KEY) as PreferredPaymentMethod) || 'UPI_GPAY'
  })
  const [sandboxAvailable, setSandboxAvailable] = useState<boolean | null>(null)
  const [savedSuccess, setSavedSuccess] = useState(false)
  const [upiVpa, setUpiVpa] = useState(() => localStorage.getItem('artvault_saved_upi_vpa') || '')
  const [vpaError, setVpaError] = useState<string | null>(null)

  useEffect(() => {
    void testPaymentsAvailable().then(setSandboxAvailable)
  }, [])

  const handleSelectPreferred = (method: PreferredPaymentMethod) => {
    setPreferred(method)
    localStorage.setItem(PREFERRED_KEY, method)
    setSavedSuccess(true)
    setTimeout(() => setSavedSuccess(false), 2500)
  }

  const handleSaveUpiVpa = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = upiVpa.trim()
    if (!trimmed) {
      localStorage.removeItem('artvault_saved_upi_vpa')
      setSavedSuccess(true)
      setTimeout(() => setSavedSuccess(false), 2500)
      return
    }

    // Basic VPA validation: handle@bank
    if (!/^[\w.-]+@[\w.-]+$/.test(trimmed)) {
      setVpaError('Please enter a valid UPI ID (e.g., yourname@okhdfcbank or mobile@upi).')
      return
    }

    setVpaError(null)
    localStorage.setItem('artvault_saved_upi_vpa', trimmed)
    setSavedSuccess(true)
    setTimeout(() => setSavedSuccess(false), 2500)
  }

  return (
    <section className="flex flex-col gap-6">
      <div>
        <Link to="/account" className="text-sm text-text-secondary hover:text-text-primary hover:underline">
          ← Back to Account
        </Link>
        <PageHeader
          title="Payment Methods"
          description="Manage your preferred checkout methods and payment safety settings."
        />
      </div>

      {savedSuccess && (
        <div role="status" className="flex items-center gap-2 rounded-xl bg-emerald-500/10 p-3.5 text-sm text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
          <span>Payment preference updated successfully.</span>
        </div>
      )}

      {/* Security Guarantee Banner */}
      <Card className="flex items-start gap-3.5 border-accent-gold/30 bg-accent-gold/5 p-4">
        <Sparkles aria-hidden="true" className="h-5 w-5 shrink-0 text-accent-gold mt-0.5" />
        <div className="flex flex-col gap-1 text-xs text-text-secondary">
          <p className="font-semibold text-text-primary text-sm">Zero Raw Credential Storage Guarantee</p>
          <p>
            ArtVault complies with RBI card-on-file guidelines and never stores raw 16-digit card numbers, CVVs, or bank UPI PINs. All payment transactions are processed securely via tokenized gateway flows or Cash on Delivery.
          </p>
        </div>
      </Card>

      {/* Supported Payment Methods Grid */}
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
          Select Preferred Checkout Method
        </h2>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* UPI: Google Pay & PhonePe */}
          <Card
            onClick={() => handleSelectPreferred('UPI_GPAY')}
            className={`cursor-pointer flex flex-col justify-between p-4 transition-all ${
              preferred === 'UPI_GPAY'
                ? 'border-accent-gold ring-1 ring-accent-gold bg-accent-gold/5'
                : 'hover:border-border-strong'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                  <Smartphone aria-hidden="true" className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-medium text-sm text-text-primary">Instant UPI (GPay / PhonePe / Paytm)</h3>
                  <p className="text-xs text-text-muted">Zero transaction fee • Instant confirmation</p>
                </div>
              </div>
              {preferred === 'UPI_GPAY' && (
                <CheckCircle2 aria-hidden="true" className="h-5 w-5 text-accent-gold" />
              )}
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-xs text-text-muted">
              <QrCode aria-hidden="true" className="h-3.5 w-3.5" />
              <span>Supports Dynamic QR & Direct App Intent</span>
            </div>
          </Card>

          {/* Cards */}
          <Card
            onClick={() => handleSelectPreferred('CARDS')}
            className={`cursor-pointer flex flex-col justify-between p-4 transition-all ${
              preferred === 'CARDS'
                ? 'border-accent-gold ring-1 ring-accent-gold bg-accent-gold/5'
                : 'hover:border-border-strong'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
                  <CreditCard aria-hidden="true" className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-medium text-sm text-text-primary">Credit / Debit Cards</h3>
                  <p className="text-xs text-text-muted">Visa, Mastercard, RuPay, Amex</p>
                </div>
              </div>
              {preferred === 'CARDS' && (
                <CheckCircle2 aria-hidden="true" className="h-5 w-5 text-accent-gold" />
              )}
            </div>
            <p className="mt-3 text-xs text-text-muted">
              Protected by 3D Secure OTP authentication
            </p>
          </Card>

          {/* Cash on Delivery */}
          <Card
            onClick={() => handleSelectPreferred('COD')}
            className={`cursor-pointer flex flex-col justify-between p-4 transition-all ${
              preferred === 'COD'
                ? 'border-accent-gold ring-1 ring-accent-gold bg-accent-gold/5'
                : 'hover:border-border-strong'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
                  <Banknote aria-hidden="true" className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-medium text-sm text-text-primary">Cash on Delivery (COD)</h3>
                  <p className="text-xs text-text-muted">Inspect artwork packaging before payment</p>
                </div>
              </div>
              {preferred === 'COD' && (
                <CheckCircle2 aria-hidden="true" className="h-5 w-5 text-accent-gold" />
              )}
            </div>
            <p className="mt-3 text-xs text-text-muted">
              Available for eligible domestic addresses up to ₹50,000
            </p>
          </Card>

          {/* Razorpay Test Gateway Sandbox */}
          <Card className="flex flex-col justify-between p-4 bg-surface-elevated/50">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400">
                  <ShieldAlert aria-hidden="true" className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-medium text-sm text-text-primary">Razorpay Test Sandbox</h3>
                  <p className="text-xs text-text-muted">
                    {sandboxAvailable === true
                      ? 'Connected and active in TEST mode'
                      : 'Mock sandbox mode (Zero real charges)'}
                  </p>
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs text-text-muted">
              Allows end-to-end checkout testing with mock card credentials and simulated webhooks.
            </p>
          </Card>
        </div>
      </div>

      {/* Saved UPI ID Prefill Preference */}
      <Card className="flex flex-col gap-4 p-5">
        <h3 className="font-medium text-sm text-text-primary">Quick-Pay UPI ID (Optional)</h3>
        <p className="text-xs text-text-secondary">
          Save your virtual payment address to autofill during checkout for faster one-tap authorization.
        </p>

        {vpaError && (
          <p role="alert" className="text-xs text-danger">
            {vpaError}
          </p>
        )}

        <form onSubmit={handleSaveUpiVpa} className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="text"
            placeholder="e.g. collector@okhdfcbank"
            value={upiVpa}
            onChange={(e) => setUpiVpa(e.target.value)}
            className="flex-1 rounded-lg border border-border bg-surface-elevated px-3.5 py-2 text-sm text-text-primary placeholder:text-text-muted focus-visible:border-accent-gold focus-visible:outline-none"
          />
          <Button type="submit" variant="secondary" size="md">
            Save UPI ID
          </Button>
        </form>
      </Card>
    </section>
  )
}

