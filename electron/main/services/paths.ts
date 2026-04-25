import { app } from 'electron'
import path from 'node:path'

export function getUserDataPath() {
  return app.getPath('userData')
}

export function getConnectionsFilePath() {
  return path.join(getUserDataPath(), 'biu-connections-v1.json')
}

export function getConnectionSecretsFilePath() {
  return path.join(getUserDataPath(), 'biu-connection-secrets-v1.json')
}

export function getAppLogFilePath() {
  return path.join(getUserDataPath(), 'biu-app.log')
}
