import { multicaPanelUrl } from '../../shared/multicaWeb'
import { api, unwrap } from './api'
import { useUi } from './stores/ui'

/** Multica 链接进内嵌面板，其余链接仍交给系统浏览器。 */
export async function openAppLink(url: string, base?: string | null): Promise<void> {
  const panel = multicaPanelUrl(url, base)
  if (panel) {
    useUi.getState().openMultica(panel)
    return
  }
  await unwrap(api.app.openExternal(url))
}
