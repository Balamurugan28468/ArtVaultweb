import { createPaymentHandler } from './handler.ts'

// The handler uses Web APIs shared by Deno and the offline Node test runner.
declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (request: Request) => Promise<Response>): void }
Deno.serve(createPaymentHandler(name => Deno.env.get(name)))
