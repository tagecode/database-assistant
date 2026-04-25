/**
 * 对象树节点（主进程产生 id，渲染层作不透明 key 回传）
 */
export type ExplorerNodeKind = 'database' | 'schema' | 'table' | 'view' | 'group'

export interface ExplorerNodeDto {
  id: string
  label: string
  kind: ExplorerNodeKind
  hasChildren: boolean
  /**
   * 表/视图的限定名（由对象树生成），用于表结构/数据页
   * MySQL: database；PostgreSQL: schema
   */
  ref?: { database?: string; schema?: string }
}

export type ExplorerLoadChildrenPayload = {
  connectionId: string
  /** 根为 null，展开某节点时传其 id */
  parentKey: string | null
}

export type ExplorerLoadChildrenData = { nodes: ExplorerNodeDto[] }
