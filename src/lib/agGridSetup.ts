import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'

let registered = false

/** 在首次使用 AG Grid 前调用一次 */
export function ensureAgGridModules() {
  if (registered) {
    return
  }
  registered = true
  ModuleRegistry.registerModules([AllCommunityModule])
}
