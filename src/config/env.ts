import { z } from 'zod'

const booleanFromString = z
  .string()
  .transform((value) => value === 'true')
  .default(true)

const envSchema = z.object({
  /** UI opt-in only; Edge configuration and test-key checks are authoritative. */
  VITE_ENABLE_RAZORPAY_TEST: booleanFromString.default(false),
  /** Explicitly opt in to the local operator AR proof route. */
  VITE_ENABLE_DEVELOPMENT_AR_PROOF: booleanFromString.default(false),
})

export type Env = z.infer<typeof envSchema>

const parsedEnv = envSchema.safeParse(import.meta.env)

if (!parsedEnv.success) {
  console.error('Invalid ArtVault environment configuration:', parsedEnv.error.flatten().fieldErrors)
  throw new Error(
    'ArtVault environment configuration is invalid — see the console for which VITE_* variables failed validation.',
  )
}

export const env: Env = parsedEnv.data
