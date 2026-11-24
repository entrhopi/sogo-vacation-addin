import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderManifest } from '../src/manifest.js'
import { makeApp } from './helpers.js'

const TEMPLATE = [
  '<OfficeApp>',
  '<AppDomain>https://localhost:5173</AppDomain>',
  '<bt:Image id="icon16" DefaultValue="https://localhost:5173/icon-16.png"/>',
  '<bt:Url id="taskpaneUrl" DefaultValue="https://localhost:5173/taskpane.html"/>',
  '</OfficeApp>',
].join('')

describe('renderManifest', () => {
  it('rewrites URLs to the public base and AppDomain to its origin', () => {
    const rendered = renderManifest(TEMPLATE, 'https://mail.example.org/ooo/')

    expect(rendered).toContain('<AppDomain>https://mail.example.org</AppDomain>')
    expect(rendered).toContain('https://mail.example.org/ooo/icon-16.png')
    expect(rendered).toContain('https://mail.example.org/ooo/taskpane.html')
    expect(rendered).not.toContain('localhost')
  })

  it('refuses a template that still has unresolved development URLs', () => {
    expect(() => renderManifest('<OfficeApp/>', 'https://mail.example.org/ooo')).toThrowError(
      /does not contain/,
    )
  })
})

describe('GET /manifest.xml', () => {
  it('serves the rendered manifest as XML', async () => {
    const { app } = await makeApp(
      {},
      { manifest: { template: TEMPLATE, baseUrl: 'https://mail.example.org/ooo' } },
    )

    const response = await app.inject({ method: 'GET', url: '/manifest.xml' })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('application/xml')
    expect(response.body).toContain('https://mail.example.org/ooo/taskpane.html')
    await app.close()
  })

  it('is not served when no public base URL is configured', async () => {
    const { app } = await makeApp()

    const response = await app.inject({ method: 'GET', url: '/manifest.xml' })

    expect(response.statusCode).toBe(404)
    await app.close()
  })
})

describe('static add-in files', () => {
  it('serves the taskpane and uses it as the index', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ooo-static-'))
    await writeFile(join(directory, 'taskpane.html'), '<html><body>pane</body></html>')

    const { app } = await makeApp({ STATIC_DIR: directory })

    const file = await app.inject({ method: 'GET', url: '/taskpane.html' })
    expect(file.statusCode).toBe(200)
    expect(file.body).toContain('pane')

    const index = await app.inject({ method: 'GET', url: '/' })
    expect(index.statusCode).toBe(200)

    await app.close()
  })
})
