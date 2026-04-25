/**
 * 与一次 query:execute 对应的可取消句柄（MySQL / PostgreSQL 通过断开连接中断；SQLite 不注册）。
 */
const cancelFns = new Map<string, () => void>()

export function registerQueryRun(id: string, cancel: () => void) {
  cancelFns.set(id, cancel)
}

export function unregisterQueryRun(id: string) {
  cancelFns.delete(id)
}

/** 触发取消并移除登记；若 id 不存在则返回 false */
export function cancelQueryRun(id: string): boolean {
  const fn = cancelFns.get(id)
  if (!fn) {
    return false
  }
  try {
    fn()
  } catch {
    // ignore
  }
  cancelFns.delete(id)
  return true
}
