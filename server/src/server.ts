import { existsSync } from 'node:fs'
import { loadConfig } from './config.js'
import { buildApp } from './app.js'

if (existsSync('.env')) {
  process.loadEnvFile('.env')
}

const config = loadConfig()
const app = await buildApp(config)

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, 'shutting down')
  try {
    await app.close()
    process.exit(0)
  } catch (error) {
    app.log.error({ err: error }, 'shutdown failed')
    process.exit(1)
  }
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void shutdown(signal)
  })
}

try {
  await app.listen({ host: config.HOST, port: config.PORT })
} catch (error) {
  app.log.error({ err: error }, 'failed to start')
  process.exit(1)
}
