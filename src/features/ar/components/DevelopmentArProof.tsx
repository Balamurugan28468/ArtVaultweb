import {
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { env } from '@/config/env'
import type {
  Artwork,
} from '@/features/artwork'
import {
  parseProof,
  type ArProof,
} from '../proof'
import {
  ArtworkArViewer,
} from './ArtworkArViewer'

/**
 * Development AR proof.
 *
 * Every PUBLISHED artwork can obtain its own generated
 * AR manifest and framed GLB.
 */
export function DevelopmentArProof({
  artwork,
  children,
}: {
  artwork: Artwork
  children: ReactNode
}) {
  const [
    proof,
    setProof,
  ] =
    useState<ArProof | null>(
      null,
    )

  useEffect(
    () => {
      if (
        !import.meta.env.DEV ||
        !env
          .VITE_ENABLE_DEVELOPMENT_AR_PROOF ||
        artwork.status !==
          'PUBLISHED'
      ) {
        return
      }

      const controller =
        new AbortController()

      let busy = false

      const refresh =
        async () => {
          if (busy) {
            return
          }

          busy = true

          try {
            const response =
              await fetch(
                `/__ar-proof/manifest/${encodeURIComponent(
                  artwork.id,
                )}`,
                {
                  signal:
                    controller.signal,

                  cache:
                    'no-store',
                },
              )

            const next =
              response.ok
                ? parseProof(
                    await response.json(),
                    artwork.id,
                  )
                : null

            if (
              !controller.signal
                .aborted
            ) {
              setProof(next)
            }
          } catch {
            if (
              !controller.signal
                .aborted
            ) {
              setProof(null)
            }
          } finally {
            busy = false
          }
        }

      void refresh()

      const timer =
        window.setInterval(
          () =>
            void refresh(),
          15000,
        )

      window.addEventListener(
        'focus',
        refresh,
      )

      return () => {
        controller.abort()

        window.clearInterval(
          timer,
        )

        window.removeEventListener(
          'focus',
          refresh,
        )
      }
    },
    [
      artwork.id,
      artwork.status,
    ],
  )

  const image =
    artwork.images.find(
      (item) =>
        item.id ===
        proof?.imageId,
    )

  if (
    !import.meta.env.DEV ||
    !env
      .VITE_ENABLE_DEVELOPMENT_AR_PROOF ||
    artwork.status !==
      'PUBLISHED' ||
    proof?.artworkId !==
      artwork.id ||
    !image
  ) {
    return (
      <>
        {children}
      </>
    )
  }

  return (
    <div className="min-w-0 lg:col-span-2">
      <ArtworkArViewer
        key={proof.version}
        proof={proof}
        title={
          artwork.title
        }
        poster={
          image.url
        }
      />
    </div>
  )
}