// server/utils/ping-static.ts
import { load } from 'cheerio'

function normalizeUrl(u?: string) {
  const s = (u || '').trim()
  if (!s) throw new Error('Empty URL')
  try {
    return new URL(s.startsWith('http') ? s : `https://${s}`).toString()
  }
  catch {
    throw new Error('Invalid URL')
  }
}

export async function checkHeaderHasClass(
  rawUrl: string,
  className = 'plott-maintain',
) {
  const url = normalizeUrl(rawUrl)
  const started = Date.now()

  try {
    const controller = new AbortController()
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: controller.signal,
    })

    if (!res.body) throw new Error('No response body')

    const decoder = new TextDecoder('utf-8')
    const reader = res.body.getReader()
    let htmlChunk = ''
    let hasMaintainClass = false
    let totalBytes = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.length

      htmlChunk += decoder.decode(value, { stream: true })

      // Check only the part we have so far
      if (htmlChunk.includes(`<header`) && htmlChunk.includes(className)) {
        hasMaintainClass = true
        controller.abort() // stop downloading further
        break
      }

      // Avoid huge memory use — stop if we already read ~200KB
      if (htmlChunk.length > 200_000) {
        break
      }
    }

    // Load only the partial HTML we got
    const $ = load(htmlChunk)
    const selector = `header .${className}, header.${className}`
    if ($(selector).length > 0) hasMaintainClass = true

    return {
      ok: true,
      status: res.status,
      finalUrl: url,
      timeMs: Date.now() - started,
      hasMaintainClass,
    }
  }
  catch (err: any) {
    return {
      ok: false,
      status: err?.response?.status || 0,
      error: err.message || String(err),
      timeMs: Date.now() - started,
    }
  }
}
