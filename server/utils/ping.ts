// server/utils/ping.ts
export type HeaderPingResult = {
  ok: boolean
  finalUrl?: string
  status?: number
  statusText?: string
  timeMs: number
  hasMaintainClass?: boolean
  error?: string
}

function normalizeUrl(u?: string): string {
  const s = (u || '').trim()
  if (!s) throw new Error('URL is required')
  try { return new URL(s.startsWith('http') ? s : `https://${s}`).toString() }
  catch { throw new Error('Invalid URL') }
}

function extractHeader(html: string): string | null {
  const m = html.match(/<header\b[^>]*>[\s\S]*?<\/header>/i)
  return m ? m[0] : null
}
function hasClassToken(fragment: string, className: string): boolean {
  const re = /class\s*=\s*(['"])(.*?)\1/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(fragment))) {
    const tokens = m[2].split(/\s+/).filter(Boolean)
    if (tokens.includes(className)) return true
  }
  return false
}

export async function pingForHeaderClass(
  rawUrl: string,
  opts?: { className?: string, timeoutMs?: number },
): Promise<HeaderPingResult> {
  const url = normalizeUrl(rawUrl)
  const className = (opts?.className || 'plott-maintain').trim()
  const timeoutMs = Math.max(1000, Math.min(20000, Number(opts?.timeoutMs ?? 8000)))

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const started = Date.now()

  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'PlottHub/1.0 (dashboard ping)',
      },
    })
    const timeMs = Date.now() - started
    clearTimeout(timer)

    let hasMaintainClass: boolean | undefined
    const ct = res.headers.get('content-type') || ''
    if (ct.includes('text/html') || ct.includes('xml') || ct === '') {
      let html = await res.text()
      if (html.length > 512 * 1024) html = html.slice(0, 512 * 1024)
      const headerFrag = extractHeader(html)
      hasMaintainClass = headerFrag ? hasClassToken(headerFrag, className) : false
    }

    return {
      ok: res.ok,
      finalUrl: res.url,
      status: res.status,
      statusText: res.statusText,
      timeMs,
      hasMaintainClass,
    }
  }
  catch (err: any) {
    const timeMs = Date.now() - started
    clearTimeout(timer)
    return {
      ok: false,
      error: err?.name === 'AbortError' ? `Timeout after ${timeoutMs}ms` : (err?.message || String(err)),
      timeMs,
    }
  }
}
