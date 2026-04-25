/**
 * IPC 通道名集中定义，主进程与 preload 共用，避免字符串散落。
 * 渲染层应通过 preload 暴露的方法调用，不直接拼 channel 字符串。
 */
export const IPC_CHANNELS = {
  PING: 'ping',
  CONNECTION_LIST: 'connection:list',
  CONNECTION_CREATE: 'connection:create',
  CONNECTION_UPDATE: 'connection:update',
  CONNECTION_DELETE: 'connection:delete',
  CONNECTION_TEST: 'connection:test',
  DIALOG_PICK_SQLITE: 'dialog:pickSqliteFile',
  EXPLORER_LOAD_CHILDREN: 'explorer:loadChildren',
  QUERY_EXECUTE: 'query:execute',
  QUERY_FETCH_PAGE: 'query:fetchPage',
  QUERY_CANCEL: 'query:cancel',
  TABLE_GET_STRUCTURE: 'table:getStructure',
  TABLE_GET_DATA: 'table:getData',
  TABLE_UPDATE_ROW: 'table:updateRow',
  TABLE_INSERT_ROW: 'table:insertRow',
  TABLE_DELETE_ROW: 'table:deleteRow',
  APP_LOG_APPEND: 'appLog:append',
} as const
