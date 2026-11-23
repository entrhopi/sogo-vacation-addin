import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import { loadConfig, type Config } from '../src/config.js'

export const ALLOWED_ORIGIN = 'https://addin.example'

export interface TestApp {
  app: FastifyInstance
  config: Config
}

export async function makeApp(
  overrides: Record<string, string> = {},
): Promise<TestApp> {
  const config = loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    HOST: '127.0.0.1',
    PORT: '8080',
    ADDIN_ORIGINS: ALLOWED_ORIGIN,
    ...overrides,
  })
  const app = await buildApp(config)
  return { app, config }
}
