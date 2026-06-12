// server/api/sites/[id]/security-scan.post.ts
import { defineEventHandler, getRouterParam, createError } from 'h3'
import { getDb } from '../../../utils/mongo'
import { requireRole } from '../../../utils/session'

interface SecurityCheck {
  name: string
  status: 'pass' | 'fail' | 'warning' | 'error'
  message: string
  details?: any
}

interface SecurityScanResult {
  url: string
  scannedAt: string
  overallStatus: 'secure' | 'warnings' | 'vulnerable' | 'error'
  score: number
  checks: SecurityCheck[]
  recommendations: string[]
}

interface VulnerabilityInfo {
  package: string
  version?: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  cve?: string
  description: string
  detectedIn: string
}

interface VulnerabilityAnalysis {
  summary: {
    totalPackages: number
    totalVulnerabilities: number
    critical: number
    high: number
    medium: number
    low: number
  }
  vulnerablePackages: VulnerabilityInfo[]
  detectionMethods: string[]
}

// Known vulnerability database (simplified - in production, use a real CVE database)
const knownVulnerabilities: Record<string, VulnerabilityInfo[]> = {
  jquery: [
    { package: 'jquery', version: '<3.5.0', severity: 'medium', cve: 'CVE-2020-11022', description: 'XSS vulnerability in jQuery', detectedIn: 'script' },
    { package: 'jquery', version: '<3.4.0', severity: 'medium', cve: 'CVE-2019-11358', description: 'Prototype pollution vulnerability', detectedIn: 'script' },
  ],
  lodash: [
    { package: 'lodash', version: '<4.17.19', severity: 'high', cve: 'CVE-2020-8203', description: 'Prototype pollution vulnerability', detectedIn: 'script' },
  ],
  bootstrap: [
    { package: 'bootstrap', version: '<4.1.2', severity: 'medium', cve: 'CVE-2018-14041', description: 'XSS vulnerability in tooltip/popover', detectedIn: 'script' },
  ],
  moment: [
    { package: 'moment', version: '*', severity: 'low', description: 'Deprecated package with known issues', detectedIn: 'script' },
  ],
  angular: [
    { package: 'angular', version: '<1.8.0', severity: 'high', cve: 'CVE-2020-7676', description: 'XSS vulnerability in $sanitize', detectedIn: 'script' },
  ],
}

async function analyzePackageVulnerabilities(html: string, url: string): Promise<VulnerabilityAnalysis> {
  const vulnerabilities: VulnerabilityInfo[] = []
  const detectedPackages = new Set<string>()
  const detectionMethods: string[] = []

  // Method 1: Analyze script tags for CDN-loaded libraries
  const scriptMatches = html.match(/<script[^>]*src=["']([^"']+)["'][^>]*>/gi) || []
  for (const script of scriptMatches) {
    const srcMatch = script.match(/src=["']([^"']+)["']/)
    if (srcMatch) {
      const scriptUrl = srcMatch[1]

      // Check common CDN patterns
      const cdnPatterns = [
        { regex: /\/jquery[.-](\d+(?:\.\d+)*)/i, name: 'jquery' },
        { regex: /\/lodash[.-](\d+(?:\.\d+)*)/i, name: 'lodash' },
        { regex: /\/bootstrap[.-](\d+(?:\.\d+)*)/i, name: 'bootstrap' },
        { regex: /\/moment[.-](\d+(?:\.\d+)*)/i, name: 'moment' },
        { regex: /\/angular[.-](\d+(?:\.\d+)*)/i, name: 'angular' },
      ]

      for (const pattern of cdnPatterns) {
        const match = scriptUrl.match(pattern.regex)
        if (match) {
          const version = match[1]
          const packageName = pattern.name
          detectedPackages.add(`${packageName}@${version}`)

          // Check for vulnerabilities
          const packageVulns = knownVulnerabilities[packageName] || []
          for (const vuln of packageVulns) {
            if (isVersionVulnerable(version, vuln.version || '*')) {
              vulnerabilities.push({
                ...vuln,
                version,
                detectedIn: `CDN script: ${scriptUrl}`,
              })
            }
          }
        }
      }
    }
  }

  // Method 2: Check inline scripts for library signatures
  const inlineScripts = html.match(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi) || []
  for (const script of inlineScripts) {
    const content = script.replace(/<\/?script[^>]*>/gi, '')

    // Look for common library signatures
    if (content.includes('jQuery') || content.includes('$')) {
      const jqueryVersion = extractVersionFromContent(content, 'jquery')
      if (jqueryVersion) {
        detectedPackages.add(`jquery@${jqueryVersion}`)
        checkInlineVulnerabilities('jquery', jqueryVersion, vulnerabilities)
      }
    }

    if (content.includes('lodash') || content.includes('_')) {
      const lodashVersion = extractVersionFromContent(content, 'lodash')
      if (lodashVersion) {
        detectedPackages.add(`lodash@${lodashVersion}`)
        checkInlineVulnerabilities('lodash', lodashVersion, vulnerabilities)
      }
    }
  }

  if (scriptMatches.length > 0) detectionMethods.push('CDN script analysis')
  if (inlineScripts.length > 0) detectionMethods.push('Inline script analysis')

  // Method 3: Check for package.json or manifest files
  try {
    const packageJsonResponse = await fetch(new URL('/package.json', url).href, {
      signal: AbortSignal.timeout(3000),
    })
    if (packageJsonResponse.ok) {
      const packageJson = await packageJsonResponse.json()
      if (packageJson.dependencies || packageJson.devDependencies) {
        detectionMethods.push('package.json analysis')
        const deps = { ...packageJson.dependencies, ...packageJson.devDependencies }
        for (const [name, version] of Object.entries(deps)) {
          if (knownVulnerabilities[name]) {
            const cleanVersion = (version as string).replace(/[\^~]/, '')
            checkInlineVulnerabilities(name, cleanVersion, vulnerabilities)
          }
        }
      }
    }
  }
  catch {
    // Package.json not accessible - this is normal
  }

  const summary = {
    totalPackages: detectedPackages.size,
    totalVulnerabilities: vulnerabilities.length,
    critical: vulnerabilities.filter(v => v.severity === 'critical').length,
    high: vulnerabilities.filter(v => v.severity === 'high').length,
    medium: vulnerabilities.filter(v => v.severity === 'medium').length,
    low: vulnerabilities.filter(v => v.severity === 'low').length,
  }

  return {
    summary,
    vulnerablePackages: vulnerabilities,
    detectionMethods,
  }
}

function isVersionVulnerable(currentVersion: string, vulnerablePattern: string): boolean {
  if (vulnerablePattern === '*') return true

  // Simple version comparison - in production, use semver library
  if (vulnerablePattern.startsWith('<')) {
    const targetVersion = vulnerablePattern.slice(1)
    return compareVersions(currentVersion, targetVersion) < 0
  }

  return currentVersion === vulnerablePattern
}

function compareVersions(a: string, b: string): number {
  const aParts = a.split('.').map(Number)
  const bParts = b.split('.').map(Number)

  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const aPart = aParts[i] || 0
    const bPart = bParts[i] || 0

    if (aPart < bPart) return -1
    if (aPart > bPart) return 1
  }

  return 0
}

function extractVersionFromContent(content: string, packageName: string): string | null {
  const versionPatterns = [
    new RegExp(`${packageName}[\\s"']*(\\d+(?:\\.\\d+)*)`, 'i'),
    new RegExp(`version[\\s:"']*(\\d+(?:\\.\\d+)*)`, 'i'),
  ]

  for (const pattern of versionPatterns) {
    const match = content.match(pattern)
    if (match) return match[1]
  }

  return null
}

function checkInlineVulnerabilities(packageName: string, version: string, vulnerabilities: VulnerabilityInfo[]) {
  const packageVulns = knownVulnerabilities[packageName] || []
  for (const vuln of packageVulns) {
    if (isVersionVulnerable(version, vuln.version || '*')) {
      vulnerabilities.push({
        ...vuln,
        version,
        detectedIn: `Inline script analysis`,
      })
    }
  }
}

async function performSecurityScan(url: string): Promise<SecurityScanResult> {
  const checks: SecurityCheck[] = []

  // HTTPS Check
  try {
    if (url.startsWith('https://')) {
      const response = await fetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(10000),
      })

      checks.push({
        name: 'HTTPS Usage',
        status: response.ok ? 'pass' : 'warning',
        message: response.ok ? 'Site uses HTTPS correctly' : 'HTTPS enabled but response issues detected',
      })
    }
    else {
      checks.push({
        name: 'HTTPS Usage',
        status: 'fail',
        message: 'Site does not use HTTPS - data transmitted in plain text',
      })
    }
  }
  catch (error: any) {
    checks.push({
      name: 'HTTPS Usage',
      status: 'error',
      message: `HTTPS check failed: ${error.message}`,
    })
  }

  // Security Headers Check
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(10000),
    })

    const headers = response.headers
    const requiredHeaders = {
      'x-frame-options': 'X-Frame-Options',
      'x-content-type-options': 'X-Content-Type-Options',
      'strict-transport-security': 'Strict-Transport-Security',
    }

    const missingHeaders: string[] = []
    const presentHeaders: string[] = []

    for (const [header, displayName] of Object.entries(requiredHeaders)) {
      if (headers.has(header)) {
        presentHeaders.push(displayName)
      }
      else {
        missingHeaders.push(displayName)
      }
    }

    let status: 'pass' | 'warning' | 'fail' = 'pass'
    let message = 'All security headers present'

    if (missingHeaders.length > 0) {
      status = missingHeaders.length > 2 ? 'fail' : 'warning'
      message = `Security headers missing: ${missingHeaders.join(', ')}`
    }

    checks.push({
      name: 'Security Headers',
      status,
      message,
      details: { present: presentHeaders, missing: missingHeaders },
    })
  }
  catch (error: any) {
    checks.push({
      name: 'Security Headers',
      status: 'error',
      message: `Security headers check failed: ${error.message}`,
    })
  }

  // SSL Certificate Check
  try {
    if (url.startsWith('https://')) {
      const response = await fetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(10000),
      })

      checks.push({
        name: 'SSL Certificate',
        status: response.ok ? 'pass' : 'fail',
        message: response.ok ? 'SSL certificate is valid' : 'SSL certificate issues detected',
      })
    }
    else {
      checks.push({
        name: 'SSL Certificate',
        status: 'fail',
        message: 'No SSL certificate - site uses HTTP',
      })
    }
  }
  catch (error: any) {
    if (error.message.includes('certificate')) {
      checks.push({
        name: 'SSL Certificate',
        status: 'fail',
        message: 'SSL certificate is invalid or expired',
      })
    }
    else {
      checks.push({
        name: 'SSL Certificate',
        status: 'error',
        message: `SSL check failed: ${error.message}`,
      })
    }
  }

  // Content Security Check
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) })
    const html = await response.text()

    const issues: string[] = []
    const detailedFindings: any = {
      mixedContent: [],
      inlineScripts: [],
      inlineStyles: [],
      unsafeElements: [],
      externalResources: [],
      forms: [],
      iframes: [],
    }

    // Check for mixed content (HTTP resources on HTTPS page)
    if (url.startsWith('https://')) {
      const httpResources = html.match(/(?:src|href|action)=["']http:\/\/[^"']+["']/gi) || []
      if (httpResources.length > 0) {
        issues.push(`${httpResources.length} mixed content resource(s)`)
        detailedFindings.mixedContent = httpResources.map((resource) => {
          const urlMatch = resource.match(/=["']([^"']+)["']/)
          return urlMatch ? urlMatch[1] : resource
        })
      }
    }

    // Check for inline scripts with content
    const inlineScriptMatches = html.match(/<script(?![^>]*src=)[^>]*>[\s\S]*?<\/script>/gi) || []
    if (inlineScriptMatches.length > 0) {
      issues.push(`${inlineScriptMatches.length} inline script(s)`)
      detailedFindings.inlineScripts = inlineScriptMatches.map((script, index) => ({
        index: index + 1,
        preview: script.substring(0, 200) + (script.length > 200 ? '...' : ''),
        length: script.length,
        hasNonce: script.includes('nonce='),
        content: script.replace(/<\/?script[^>]*>/gi, '').trim().substring(0, 500),
      }))
    }

    // Check for inline styles
    const inlineStyleMatches = html.match(/style=["'][^"']{20,}["']/gi) || []
    if (inlineStyleMatches.length > 10) {
      issues.push(`${inlineStyleMatches.length} inline style attributes`)
      detailedFindings.inlineStyles = inlineStyleMatches.slice(0, 10).map((style, index) => ({
        index: index + 1,
        content: style.substring(0, 100) + (style.length > 100 ? '...' : ''),
        length: style.length,
      }))
    }

    // Check for potentially unsafe elements
    const unsafeElements = html.match(/<(iframe|object|embed|applet)[^>]*>/gi) || []
    if (unsafeElements.length > 0) {
      issues.push(`${unsafeElements.length} potentially unsafe element(s)`)
      detailedFindings.unsafeElements = unsafeElements.map((element) => {
        const srcMatch = element.match(/src=["']([^"']+)["']/)
        const tagMatch = element.match(/<(\w+)/)
        return {
          tag: tagMatch ? tagMatch[1] : 'unknown',
          src: srcMatch ? srcMatch[1] : null,
          element: element.substring(0, 150) + (element.length > 150 ? '...' : ''),
        }
      })
    }

    // Check external resources and their security
    const externalResourceMatches = html.match(/(?:src|href)=["'](https?:\/\/[^"']+)["']/gi) || []
    const externalDomains = new Set()
    const externalResources = []

    for (const resource of externalResourceMatches) {
      const urlMatch = resource.match(/=["']([^"']+)["']/)
      if (urlMatch) {
        try {
          const resourceUrl = new URL(urlMatch[1])
          const siteDomain = new URL(url).hostname
          if (resourceUrl.hostname !== siteDomain) {
            externalDomains.add(resourceUrl.hostname)
            externalResources.push({
              url: urlMatch[1],
              domain: resourceUrl.hostname,
              protocol: resourceUrl.protocol,
              isSecure: resourceUrl.protocol === 'https:',
            })
          }
        }
        catch {}
      }
    }

    if (externalDomains.size > 0) {
      detailedFindings.externalResources = {
        uniqueDomains: Array.from(externalDomains),
        totalResources: externalResources.length,
        insecureCount: externalResources.filter(r => !r.isSecure).length,
        resources: externalResources.slice(0, 20), // Limit to first 20
      }
    }

    // Check forms for security
    const formMatches = html.match(/<form[^>]*>[\s\S]*?<\/form>/gi) || []
    if (formMatches.length > 0) {
      detailedFindings.forms = formMatches.map((form, index) => {
        const actionMatch = form.match(/action=["']([^"']*)["']/i)
        const methodMatch = form.match(/method=["']([^"']+)["']/i)
        const hasPasswordField = form.toLowerCase().includes('type="password"') || form.toLowerCase().includes('name="password"')
        const hasCSRFToken = form.includes('csrf') || form.includes('_token')

        return {
          index: index + 1,
          action: actionMatch ? actionMatch[1] : '',
          method: methodMatch ? methodMatch[1].toUpperCase() : 'GET',
          hasPasswordField,
          hasCSRFToken,
          isSecureAction: !actionMatch || !actionMatch[1] || actionMatch[1].startsWith('https://') || actionMatch[1].startsWith('/'),
        }
      })
    }

    // Check for iframes
    const iframeMatches = html.match(/<iframe[^>]*>/gi) || []
    if (iframeMatches.length > 0) {
      detailedFindings.iframes = iframeMatches.map((iframe, index) => {
        const srcMatch = iframe.match(/src=["']([^"']+)["']/i)
        const sandboxMatch = iframe.match(/sandbox=["']([^"']+)["']/i)

        return {
          index: index + 1,
          src: srcMatch ? srcMatch[1] : '',
          hasSandbox: !!sandboxMatch,
          sandbox: sandboxMatch ? sandboxMatch[1] : null,
          element: iframe.substring(0, 200) + (iframe.length > 200 ? '...' : ''),
        }
      })
    }

    let status: 'pass' | 'warning' | 'fail' = 'pass'
    let message = 'Content security looks good'

    if (issues.length > 0) {
      const hasCritical = issues.some(i => i.includes('mixed content') || i.includes('unsafe element'))
      status = hasCritical ? 'fail' : 'warning'
      message = `Content security issues found: ${issues.join(', ')}`
    }

    checks.push({
      name: 'Content Security',
      status,
      message,
      details: detailedFindings,
    })
  }
  catch (error: any) {
    checks.push({
      name: 'Content Security',
      status: 'error',
      message: `Content security check failed: ${error.message}`,
    })
  }

  // Calculate score and overall status
  const weights = { pass: 100, warning: 60, fail: 0, error: 30 }
  const score = Math.round(checks.reduce((sum, check) => sum + weights[check.status], 0) / checks.length)

  const hasErrors = checks.some(c => c.status === 'error')
  const hasFails = checks.some(c => c.status === 'fail')
  const hasWarnings = checks.some(c => c.status === 'warning')

  let overallStatus: SecurityScanResult['overallStatus']
  if (hasErrors) overallStatus = 'error'
  else if (hasFails) overallStatus = 'vulnerable'
  else if (hasWarnings) overallStatus = 'warnings'
  else overallStatus = 'secure'

  // Generate recommendations
  const recommendations: string[] = []
  for (const check of checks) {
    if (check.status === 'fail' || check.status === 'warning') {
      switch (check.name) {
        case 'HTTPS Usage':
          if (check.status === 'fail') {
            recommendations.push('Enable HTTPS with a valid SSL/TLS certificate')
          }
          break
        case 'Security Headers':
          recommendations.push('Implement missing security headers to protect against common attacks')
          break
        case 'SSL Certificate':
          recommendations.push('Fix SSL certificate issues or renew expired certificate')
          break
        case 'Content Security':
          recommendations.push('Implement Content Security Policy and avoid mixed content')
          break
        case 'Package Vulnerabilities':
          recommendations.push('Update vulnerable packages to their latest secure versions')
          break
      }
    }
  }

  // Package Vulnerability Check
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) })
    const html = await response.text()

    const vulnerabilityAnalysis = await analyzePackageVulnerabilities(html, url)

    let vulnStatus: SecurityCheck['status'] = 'pass'
    let vulnMessage = 'No vulnerable packages detected'

    if (vulnerabilityAnalysis.summary.totalVulnerabilities > 0) {
      const { critical, high, medium, low } = vulnerabilityAnalysis.summary
      if (critical > 0) {
        vulnStatus = 'fail'
        vulnMessage = `${critical} critical vulnerabilities found in JavaScript packages`
      }
      else if (high > 0) {
        vulnStatus = 'fail'
        vulnMessage = `${high} high severity vulnerabilities found in packages`
      }
      else if (medium > 0) {
        vulnStatus = 'warning'
        vulnMessage = `${medium} medium severity vulnerabilities found`
      }
      else {
        vulnStatus = 'warning'
        vulnMessage = `${low} low severity vulnerabilities found`
      }
    }

    checks.push({
      name: 'Package Vulnerabilities',
      status: vulnStatus,
      message: vulnMessage,
      details: vulnerabilityAnalysis,
    })
  }
  catch (error: any) {
    checks.push({
      name: 'Package Vulnerabilities',
      status: 'error',
      message: `Vulnerability check failed: ${error.message}`,
      details: { errorType: error.name, errorMessage: error.message },
    })
  }

  // Recalculate overall status and score with vulnerability check included
  const passCount = checks.filter(c => c.status === 'pass').length
  const warnCount = checks.filter(c => c.status === 'warning').length
  const failCount = checks.filter(c => c.status === 'fail').length
  const errorCount = checks.filter(c => c.status === 'error').length

  const totalChecks = checks.length
  const finalScore = Math.round(((passCount + (warnCount * 0.5)) / totalChecks) * 100)

  let finalOverallStatus: SecurityScanResult['overallStatus']
  if (errorCount > 0) finalOverallStatus = 'error'
  else if (failCount > 0) finalOverallStatus = 'vulnerable'
  else if (warnCount > 0) finalOverallStatus = 'warnings'
  else finalOverallStatus = 'secure'

  return {
    url,
    scannedAt: new Date().toISOString(),
    overallStatus: finalOverallStatus,
    score: finalScore,
    checks,
    recommendations: Array.from(new Set(recommendations)),
  }
}

export default defineEventHandler(async (event) => {
  // Require admin or manager role
  await requireRole(event, ['admin', 'manager'])

  const siteId = getRouterParam(event, 'id')
  if (!siteId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Site ID is required',
    })
  }

  const db = await getDb()

  // Get site details
  const site = await db.collection('sites').findOne({ id: siteId })
  if (!site) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Site not found',
    })
  }

  const websiteUrl = site.websiteUrl || site.domain
  if (!websiteUrl) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Site has no website URL configured',
    })
  }

  // Ensure URL has protocol
  let targetUrl = websiteUrl
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = `https://${targetUrl}`
  }

  try {
    // Perform security scan
    const scanResult = await performSecurityScan(targetUrl)

    // Store scan result in database
    const securityScan = {
      siteId: siteId,
      siteName: site.name,
      siteEnv: site.env,
      url: targetUrl,
      scannedAt: scanResult.scannedAt,
      scannedBy: event.context.user?.id || 'system',
      overallStatus: scanResult.overallStatus,
      score: scanResult.score,
      checks: scanResult.checks,
      recommendations: scanResult.recommendations,
    }

    await db.collection('security_scans').insertOne(securityScan)

    return scanResult
  }
  catch (error: any) {
    throw createError({
      statusCode: 500,
      statusMessage: `Security scan failed: ${error.message}`,
    })
  }
})
