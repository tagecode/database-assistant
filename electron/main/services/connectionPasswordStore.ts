import { readFile, writeFile } from 'node:fs/promises'
import { safeStorage } from 'electron'
import { getConnectionSecretsFilePath } from './paths'

type FileShape = { v: 1; enc: Record<string, string> }

async function readRaw(): Promise<FileShape> {
  try {
    const raw = await readFile(getConnectionSecretsFilePath(), 'utf8')
    const p = JSON.parse(raw) as FileShape
    if (p?.v === 1 && p.enc && typeof p.enc === 'object') {
      return p
    }
  } catch {
    // ignore
  }
  return { v: 1, enc: {} }
}

async function writeRaw(f: FileShape) {
  await writeFile(
    getConnectionSecretsFilePath(),
    JSON.stringify(f, null, 2),
    'utf8',
  )
}

function ensureEncryption() {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('当前系统未提供可用的安全存储，无法保存数据库密码。')
  }
}

export async function setConnectionPasswordAsync(
  id: string,
  password: string | undefined,
) {
  if (password === undefined) {
    return
  }
  if (password === '') {
    await removeConnectionPassword(id)
    return
  }
  ensureEncryption()
  const buf = safeStorage.encryptString(password)
  const f = await readRaw()
  f.enc[id] = buf.toString('base64')
  await writeRaw(f)
}

export async function getConnectionPassword(
  id: string,
): Promise<string | undefined> {
  if (!safeStorage.isEncryptionAvailable()) {
    return undefined
  }
  const f = await readRaw()
  const b64 = f.enc[id]
  if (!b64) {
    return undefined
  }
  return safeStorage.decryptString(Buffer.from(b64, 'base64'))
}

export async function removeConnectionPassword(id: string) {
  const f = await readRaw()
  if (f.enc[id] !== undefined) {
    delete f.enc[id]
    await writeRaw(f)
  }
}
