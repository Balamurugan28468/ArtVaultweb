import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { generateProof } from './lib/arProof.mjs'

try {
  const config = process.argv[2]
  if (!config || process.argv.length !== 3) throw new Error('Usage: npm run ar:prepare -- path/to/selection.json')
  const result = await generateProof(fileURLToPath(new URL('../', import.meta.url)), JSON.parse(await readFile(config, 'utf8')))
  console.log(JSON.stringify(result, null, 2))
  console.log(`Open /artworks/${result.artworkId}/ar on the development server. Physical-device verification is still required.`)
} catch (error) {
  console.error(error instanceof Error ? error.message : 'AR proof preparation failed.')
  process.exitCode = 1
}
