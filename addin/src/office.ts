export interface OfficeInfo {
  email: string | null
  language: string
  inOutlook: boolean
}

const READY_TIMEOUT_MS = 2_000

/**
 * Office.js only resolves inside a host. When the pane is opened in a plain
 * browser (for development or a quick look), fall back to manual entry instead
 * of hanging on `Office.onReady()`.
 */
export async function readOfficeInfo(): Promise<OfficeInfo> {
  const fallbackLanguage = navigator.language || 'en'

  if (typeof Office === 'undefined') {
    return { email: null, language: fallbackLanguage, inOutlook: false }
  }

  try {
    await Promise.race([
      Office.onReady(),
      new Promise((_resolve, reject) => {
        setTimeout(() => reject(new Error('Office.onReady timed out')), READY_TIMEOUT_MS)
      }),
    ])

    const mailbox = Office.context?.mailbox
    const email = mailbox?.userProfile?.emailAddress ?? null
    const language = Office.context?.displayLanguage || fallbackLanguage

    return { email, language, inOutlook: Boolean(mailbox) }
  } catch {
    return { email: null, language: fallbackLanguage, inOutlook: false }
  }
}
