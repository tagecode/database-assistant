import { Buffer } from 'node:buffer'

export function b64e(s: string) {
  return Buffer.from(s, 'utf8').toString('base64url')
}

export function b64d(s: string) {
  return Buffer.from(s, 'base64url').toString('utf8')
}
