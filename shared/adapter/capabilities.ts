import type { DatabaseKind } from '../dto/connection'

/** MySQL / PostgreSQL：通过断开执行用连接可中断；SQLite 为同步 API，未实现中断 */
export function supportsQueryCancel(kind: DatabaseKind): boolean {
  return kind === 'mysql' || kind === 'postgres'
}
