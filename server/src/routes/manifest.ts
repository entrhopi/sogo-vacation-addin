import type { FastifyInstance } from 'fastify'
import { renderManifest } from '../manifest.js'

export interface ManifestOptions {
  template: string
  baseUrl: string
}

export function registerManifestRoute(app: FastifyInstance, options: ManifestOptions): void {
  // Rendering at registration means a broken template fails the container at
  // startup instead of serving a manifest with localhost URLs.
  const rendered = renderManifest(options.template, options.baseUrl)

  app.get('/manifest.xml', async (_request, reply) => {
    reply.type('application/xml; charset=utf-8').send(rendered)
  })
}
