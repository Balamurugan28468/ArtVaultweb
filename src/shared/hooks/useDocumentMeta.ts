import { useEffect } from 'react'

/**
 * Sets the document title plus truthful Open Graph/Twitter meta tags for as
 * long as the calling page is mounted, restoring the previous title and
 * removing whatever tags *this hook itself created* on unmount — a page
 * that was never given a title/description before this hook ran is left
 * exactly as it was, not with stale tags from a page the visitor has since
 * navigated away from. Deliberately dependency-free: this project has no
 * head-management library, and one specific page's real title/description/
 * image doesn't justify adding one — see ARTVAULT_PROJECT_STATE.md's
 * Module 11 write-up.
 */
export function useDocumentMeta({ title, description, image }: { title: string; description?: string; image?: string }) {
  useEffect(() => {
    const previousTitle = document.title
    document.title = title

    const createdTags: HTMLMetaElement[] = []
    function setMeta(attribute: 'property' | 'name', key: string, content: string) {
      let tag = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`)
      if (!tag) {
        tag = document.createElement('meta')
        tag.setAttribute(attribute, key)
        document.head.appendChild(tag)
        createdTags.push(tag)
      }
      tag.setAttribute('content', content)
    }

    setMeta('property', 'og:title', title)
    setMeta('name', 'twitter:title', title)
    if (description) {
      setMeta('property', 'og:description', description)
      setMeta('name', 'twitter:description', description)
    }
    if (image) {
      setMeta('property', 'og:image', image)
      setMeta('name', 'twitter:image', image)
    }
    setMeta('name', 'twitter:card', image ? 'summary_large_image' : 'summary')

    return () => {
      document.title = previousTitle
      createdTags.forEach((tag) => tag.remove())
    }
  }, [title, description, image])
}
