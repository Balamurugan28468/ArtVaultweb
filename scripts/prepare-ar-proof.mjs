import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import {
  generateProof,
  prepareAllProofs,
} from './lib/arProof.mjs'

function cleanJson(text) {
  return text.replace(
    /^\uFEFF/,
    '',
  )
}

function summary(result) {
  return {
    artworkId:
      result.artworkId,

    imageId:
      result.imageId,

    sizingMode:
      result.sizingMode,

    artworkWidthMm:
      result.artworkWidthMm,

    artworkHeightMm:
      result.artworkHeightMm,

    frameMm:
      result.frameMm,

    widthMm:
      result.widthMm,

    heightMm:
      result.heightMm,

    includesFrame:
      result.includesFrame,

    version:
      result.version,

    bytes:
      result.bytes,
  }
}

try {
  const argument =
    process.argv[2]

  const root =
    fileURLToPath(
      new URL(
        '../',
        import.meta.url,
      ),
    )

  if (
    argument ===
    '--all'
  ) {
    const results =
      await prepareAllProofs(
        root,
      )

    console.log(
      JSON.stringify(
        results.map(
          summary,
        ),
        null,
        2,
      ),
    )

    console.log(
      `Prepared ${results.length} published artwork AR proof${results.length === 1 ? '' : 's'}.`,
    )

    console.log(
      'Each published artwork now has an independent local manifest and framed GLB. New published artworks can also be generated lazily when their AR page is opened.',
    )
  } else {
    if (
      !argument ||
      process.argv.length !==
        3
    ) {
      throw new Error(
        'Usage: npm run ar:prepare -- --all OR npm run ar:prepare -- path/to/selection.json',
      )
    }

    const selection =
      JSON.parse(
        cleanJson(
          await readFile(
            argument,
            'utf8',
          ),
        ),
      )

    const result =
      await generateProof(
        root,
        selection,
      )

    console.log(
      JSON.stringify(
        summary(
          result,
        ),
        null,
        2,
      ),
    )

    console.log(
      `Prepared framed AR proof at approximately ${Math.round(result.widthMm)} × ${Math.round(result.heightMm)} mm.`,
    )

    console.log(
      `Open /artworks/${result.artworkId}/ar on the development server.`,
    )
  }
} catch (
  error
) {
  console.error(
    error instanceof
      Error
      ? error.message
      : 'AR proof preparation failed.',
  )

  process.exitCode =
    1
}