import { CLOUD_MULTICA_WEB_URL, DEFAULT_MULTICA_WEB_URL, normalizeMulticaWebUrl } from '../../../shared/multicaWeb'
import { usePrefs } from '../queries'
import { useUi } from '../stores/ui'

function localWebUrl(configured?: string | null): string {
  const home = normalizeMulticaWebUrl(configured)
  const host = new URL(home).hostname
  return host === 'localhost' || host === '127.0.0.1' ? home : DEFAULT_MULTICA_WEB_URL
}

function sameOrigin(url: string, base: string): boolean {
  try {
    return new URL(url).origin === new URL(base).origin
  } catch {
    return false
  }
}

export function MulticaWebPage() {
  const prefs = usePrefs()
  const configured = normalizeMulticaWebUrl(prefs.data?.multica?.webUrl)
  const local = localWebUrl(configured)
  const url = useUi((s) => s.multicaUrl) || configured
  const nav = useUi((s) => s.multicaNav)
  const openMultica = useUi((s) => s.openMultica)
  const cloud = url.startsWith('https://multica.ai') || url.startsWith('https://www.multica.ai')

  return (
    <div className="page multica-web-page">
      <div className="multica-web-bar">
        <button type="button" className={sameOrigin(url, local) ? 'btn btn-small' : 'btn btn-small btn-ghost'} onClick={() => openMultica(local)}>
          本地
        </button>
        <button type="button" className={cloud ? 'btn btn-small' : 'btn btn-small btn-ghost'} onClick={() => openMultica(CLOUD_MULTICA_WEB_URL)}>
          云端
        </button>
        <span className="muted mono multica-web-url" title={url}>
          {url}
        </span>
      </div>
      <iframe key={`${nav}:${url}`} title="Multica" src={url} />
    </div>
  )
}
