import { z } from 'zod'

const booleanFromString = z
  .string()
  .transform((value) => value === 'true')
  .default(true)

const envSchema = z.object({
  VITE_FIREBASE_API_KEY: z.string().min(1).default('demo-api-key'),
  VITE_FIREBASE_AUTH_DOMAIN: z.string().min(1).default('localhost'),
  VITE_FIREBASE_PROJECT_ID: z.string().min(1).default('demo-artvault'),
  VITE_FIREBASE_STORAGE_BUCKET: z.string().min(1).default('demo-artvault.appspot.com'),
  VITE_FIREBASE_MESSAGING_SENDER_ID: z.string().min(1).default('000000000000'),
  VITE_FIREBASE_APP_ID: z.string().min(1).default('1:000000000000:web:0000000000000000000000'),
  VITE_USE_FIREBASE_EMULATORS: booleanFromString,
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
