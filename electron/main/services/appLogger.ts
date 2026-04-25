import { app } from 'electron'
import { mkdir, appendFile } from 'node:fs/promises'
import path from 'node:path'
import type { AppLogAppendPayload } from '../../../shared/dto/app-log'
import { getAppLogFilePath } from './paths'

function normalizeDetails(details: unknown): unknown {
  if (details instanceof Error) {
    return {
      name: details.name,
      message: details.message,
      stack: details.stack,
    }
  }
  return details
}

export async function appendAppLog(payload: AppLogAppendPayload): Promise<void> {
  const filePath = getAppLogFilePath()
  await mkdir(path.dirname(filePath), { recursive: true })
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    appVersion: app.getVersion(),
    pid: process.pid,
    level: payload.level,
    source: payload.source,
    scope: payload.scope,
    message: payload.message,
    details: normalizeDetails(payload.details),
  })
  await appendFile(filePath, `${line}\n`, 'utf8')
}

export function writeAppLog(payload: AppLogAppendPayload): void {
  void appendAppLog(payload).catch((error) => {
    console.error('写入应用日志失败', error)
  })
}

export function installMainProcessLogging(): void {
  writeAppLog({
    level: 'info',
    source: 'main',
    scope: 'app.startup',
    message: '应用启动',
  })

  process.on('uncaughtException', (error) => {
    writeAppLog({
      level: 'error',
      source: 'main',
      scope: 'process.uncaughtException',
      message: error.message,
      details: error,
    })
  })

  process.on('unhandledRejection', (reason) => {
    writeAppLog({
      level: 'error',
      source: 'main',
      scope: 'process.unhandledRejection',
      message: reason instanceof Error ? reason.message : String(reason),
      details: reason,
    })
  })
}
