/**
 * The add-in repository ships one manifest, with development URLs on
 * localhost. Serving it for a real deployment is a rewrite of those URLs, so
 * the image stays domain-agnostic and the hostname never enters the repo.
 */
const DEVELOPMENT_ORIGIN = 'https://localhost:5173'

export function renderManifest(template: string, publicBaseUrl: string): string {
  if (!template.includes(DEVELOPMENT_ORIGIN)) {
    throw new Error(
      `Manifest template does not contain ${DEVELOPMENT_ORIGIN}; refusing to render a manifest with unresolved URLs`,
    )
  }

  const base = publicBaseUrl.replace(/\/+$/, '')
  const origin = new URL(base).origin

  return template
    // AppDomain is an origin (no path); everything else is the full base.
    .replace(`<AppDomain>${DEVELOPMENT_ORIGIN}</AppDomain>`, `<AppDomain>${origin}</AppDomain>`)
    .replaceAll(DEVELOPMENT_ORIGIN, base)
}
