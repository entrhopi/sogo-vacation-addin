import { readFileSync } from 'node:fs'

interface PackageManifest {
  version?: unknown
}

function readVersion(): string {
  try {
    const manifest = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as PackageManifest
    return typeof manifest.version === 'string' ? manifest.version : '0.0.0-unknown'
  } catch {
    return '0.0.0-unknown'
  }
}

export const SERVICE_VERSION = readVersion()
