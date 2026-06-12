// server/api/security.post.ts
import { createError, defineEventHandler, readRawBody } from 'h3'
import crypto, { timingSafeEqual } from 'node:crypto'

type SeverityCounts = { critical: number, high: number, medium: number, low: number, unknown?: number }

type Payload = {
  site: { id: string, name?: string | null, env?: string | null }
  run: {
    timestamp: string
    php_version?: string | null
    tool?: 'snyk'
    ci_url?: string | null
    git_sha?: string | null
    git_branch?: string | null
    args?: string | null
  }
  snyk: {
    exit_code: number
    ok: boolean
    org?: string | null
    project_id?: string | null
    package_manager?: string | null
    path?: string | null
    dependency_count?: number | null
    unique_issues?: number | null
    severity_counts?: SeverityCounts
  }
  summary: {
    has_vulnerabilities: boolean
    critical: number
    high: number
    medium: number
    low: number
    total: number
  }
  vulnerabilities?: any[] // normalized items (optional)
  raw?: { snyk_json?: any } // optional raw
}

function b64(buf: Buffer) { return buf.toString('base64') }

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const apiKey = config.apiKey as string | undefined
  const hmacSecret = config.hmacSecret as string | undefined
  if (!apiKey || !hmacSecret) {
    throw createError({ statusCode: 500, statusMessage: 'Server is misconfigured' })
  }

  // ---------- Auth (Bearer) ----------
  const auth = getHeader(event, 'authorization') || ''
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : null
  if (!token) throw createError({ statusCode: 401, statusMessage: 'Missing bearer token' })

  const tokenOk = timingSafeEqual(Buffer.from(token), Buffer.from(apiKey))
  if (!tokenOk) throw createError({ statusCode: 401, statusMessage: 'Invalid token' })

  // ---------- Signature (nonce + body) ----------
  const nonce = getHeader(event, 'x-nonce') || ''
  const signature = getHeader(event, 'x-signature') || ''
  if (!nonce || !signature) {
    throw createError({ statusCode: 400, statusMessage: 'Missing X-Nonce or X-Signature' })
  }

  // Need raw body for HMAC verification
  const raw = await readRawBody(event, false) // string
  if (!raw) throw createError({ statusCode: 400, statusMessage: 'Empty body' })

  const expected = crypto.createHmac('sha256', hmacSecret).update(`${nonce}.${raw}`).digest()
  const provided = Buffer.from(signature, 'base64')
  const sigOk = provided.length === expected.length && timingSafeEqual(provided, expected)
  if (!sigOk) throw createError({ statusCode: 401, statusMessage: 'Bad signature' })

  // ---------- Parse & minimal validation ----------
  let body: Payload
  try {
    body = JSON.parse(raw)
  }
  catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid JSON' })
  }

  if (!body?.site?.id || !body?.run?.timestamp || typeof body?.snyk?.exit_code !== 'number') {
    throw createError({ statusCode: 422, statusMessage: 'Missing required fields' })
  }

  // ---------- Assemble record ----------
  const siteId = body.site.id
  const ts = new Date(body.run.timestamp).toISOString()
  const stamp = ts.replace(/[:.]/g, '-') // file-safe
  const rand = crypto.randomBytes(3).toString('hex')

  const record = {
    kind: 'snyk-security',
    receivedAt: new Date().toISOString(),
    site: body.site,
    run: body.run,
    snyk: body.snyk,
    summary: body.summary,
    counts: body.snyk?.severity_counts ?? {
      critical: body.summary.critical,
      high: body.summary.high,
      medium: body.summary.medium,
      low: body.summary.low,
    },
    vulnerabilities: body.vulnerabilities ?? null,
    raw: body.raw ?? null,
  }

  // ---------- Persist ----------
  const store = useStorage('data:security')
  const base = `${siteId}`
  const filePath = `${base}/${stamp}-${rand}.json`

  await store.setItem(filePath, record)

  // Maintain a simple index + "latest" pointer for fast dashboards
  const idxPath = `${base}/index.json`
  const latestPath = `${base}/latest.json`

  // Append to index (cap at N for quick reads)
  const MAX_INDEX = 200
  const existingIndex = (await store.getItem<any[]>(idxPath)) || []
  existingIndex.unshift({
    path: filePath,
    ts,
    env: body.site.env ?? null,
    exit: body.snyk.exit_code,
    totalIssues: body.summary.total,
    high: body.summary.high,
    critical: body.summary.critical,
    git: { sha: body.run.git_sha ?? null, branch: body.run.git_branch ?? null },
  })
  const trimmed = existingIndex.slice(0, MAX_INDEX)

  await Promise.all([
    store.setItem(idxPath, trimmed),
    store.setItem(latestPath, { path: filePath, ts, summary: body.summary, run: body.run, site: body.site }),
  ])

  return {
    ok: true,
    stored: { path: filePath },
    summary: body.summary,
  }
})
