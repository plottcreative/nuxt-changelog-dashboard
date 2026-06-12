// server/api/utils/ping.post.ts
import { defineEventHandler, readBody, createError } from 'h3'
import { requireUser } from '../../utils/session'

function normalizeUrl(u?: string) {
  const s = (u || '').trim()
  if (!s) throw createError({ statusCode: 400, statusMessage: 'URL is required' })
  try {
    return new URL(s.startsWith('http') ? s : `https://${s}`).toString()
  }
  catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid URL' })
  }
}

// Grab only the <header>…</header> fragment (case-insensitive)
function extractHeader(html: string): string | null {
  const m = html.match(/<header\b[^>]*>[\s\S]*?<\/header>/i)
  return m ? m[0] : null
}

// True if any class="…" attribute within the fragment contains the token
function hasClassToken(fragment: string, className: string): boolean {
  const classAttrRE = /class\s*=\s*(['"])(.*?)\1/gi
  let m: RegExpExecArray | null
  while ((m = classAttrRE.exec(fragment))) {
    const tokens = m[2].split(/\s+/).filter(Boolean)
    if (tokens.includes(className)) return true
  }
  return false
}

export default defineEventHandler(async (event) => {
  // Keep behind auth; change to requireRole(event, ['manager','admin']) if you prefer
  await requireUser(event)

  const body = await readBody<{ url?: string, className?: string, timeoutMs?: number }>(event)
  const url = normalizeUrl(body?.url)
  const className = (body?.className || 'plott-maintain').trim()
  const timeoutMs = Math.max(1000, Math.min(20000, Number(body?.timeoutMs ?? 8000)))

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const started = Date.now()

  try {
    const res = await fetch(url, {
      method: 'GET', // need body to inspect <header>
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'PlottHub/1.0 (+dashboard ping)',
      },
    })

    const timeMs = Date.now() - started
    clearTimeout(timer)

    let hasMaintainClass: boolean | undefined
    const statusText = res.statusText

    // Only attempt to read text for HTML-like responses
    const ct = res.headers.get('content-type') || ''
    if (ct.includes('text/html') || ct.includes('application/xhtml+xml') || ct.includes('xml') || ct === '') {
      // Read at most ~512KB to avoid huge pages
      let html = ''
      try {
        // Prefer streaming if available to cut early when header closes
        if (res.body && 'getReader' in res.body) {
          const reader = (res.body as ReadableStream<Uint8Array>).getReader()
          const decoder = new TextDecoder('utf-8', { fatal: false })
          const maxBytes = 512 * 1024
          let received = 0
          let headerClosed = false

          while (!headerClosed) {
            const { value, done } = await reader.read()
            if (done) break
            received += value?.length || 0
            html += decoder.decode(value, { stream: true })
            headerClosed = /<\/header>/i.test(html)
            if (received >= maxBytes) break
          }
          html += decoder.decode()
        }
        else {
          html = await res.text()
          if (html.length > 512 * 1024) html = html.slice(0, 512 * 1024)
        }
      }
      catch { /* ignore body read errors */ }

      if (html) {
        const headerFrag = extractHeader(html)
        hasMaintainClass = headerFrag ? hasClassToken(headerFrag, className) : false
      }
    }

    return {
      ok: res.ok,
      finalUrl: res.url,
      status: res.status,
      statusText,
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
})
