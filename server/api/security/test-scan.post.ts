// server/api/security/test-scan.post.ts
import { defineEventHandler, readBody } from 'h3'

interface SecurityCheck {
  name: string
  status: 'pass' | 'fail' | 'warning' | 'error'
  message: string
  details?: any
}

async function testSecurityScan(url: string): Promise<SecurityCheck[]> {
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
        details: {
          status: response.status,
          statusText: response.statusText,
          redirected: response.redirected,
          url: response.url,
        },
      })
    }
    else {
      checks.push({
        name: 'HTTPS Usage',
        status: 'fail',
        message: 'Site does not use HTTPS - data transmitted in plain text',
        details: {
          currentProtocol: url.split('://')[0],
          recommendation: 'Enable HTTPS with SSL/TLS certificate',
        },
      })
    }
  }
  catch (error: any) {
    checks.push({
      name: 'HTTPS Usage',
      status: 'error',
      message: `HTTPS check failed: ${error.message}`,
      details: { errorType: error.name, errorMessage: error.message },
    })
  }

  // Security Headers Check
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(10000),
    })

    const headers = response.headers
    const securityHeaders = {
      'x-frame-options': {
        name: 'X-Frame-Options',
        purpose: 'Prevents clickjacking attacks',
        recommendations: ['DENY', 'SAMEORIGIN'],
      },
      'x-content-type-options': {
        name: 'X-Content-Type-Options',
        purpose: 'Prevents MIME-type sniffing',
        recommendations: ['nosniff'],
      },
      'strict-transport-security': {
        name: 'Strict-Transport-Security (HSTS)',
        purpose: 'Enforces HTTPS connections',
        recommendations: ['max-age=31536000; includeSubDomains'],
      },
      'content-security-policy': {
        name: 'Content-Security-Policy',
        purpose: 'Prevents XSS and code injection',
        recommendations: ['default-src \'self\''],
      },
      'x-xss-protection': {
        name: 'X-XSS-Protection',
        purpose: 'Enables XSS filtering',
        recommendations: ['1; mode=block'],
      },
      'referrer-policy': {
        name: 'Referrer-Policy',
        purpose: 'Controls referrer information',
        recommendations: ['strict-origin-when-cross-origin'],
      },
    }

    const headerAnalysis: any = {}
    const presentHeaders: string[] = []
    const missingHeaders: string[] = []

    for (const [headerKey, headerInfo] of Object.entries(securityHeaders)) {
      const headerValue = headers.get(headerKey)
      if (headerValue) {
        presentHeaders.push(headerInfo.name)
        headerAnalysis[headerKey] = {
          present: true,
          value: headerValue,
          purpose: headerInfo.purpose,
          isRecommended: headerInfo.recommendations.some(rec =>
            headerValue.toLowerCase().includes(rec.toLowerCase().split(';')[0]),
          ),
        }
      }
      else {
        missingHeaders.push(headerInfo.name)
        headerAnalysis[headerKey] = {
          present: false,
          purpose: headerInfo.purpose,
          recommendations: headerInfo.recommendations,
        }
      }
    }

    let status: 'pass' | 'warning' | 'fail' = 'pass'
    let message = 'All critical security headers present'

    if (missingHeaders.length > 0) {
      const criticalMissing = missingHeaders.filter(h =>
        ['X-Frame-Options', 'X-Content-Type-Options', 'Strict-Transport-Security'].includes(h),
      ).length

      if (criticalMissing > 2) {
        status = 'fail'
        message = `Critical security headers missing: ${missingHeaders.slice(0, 3).join(', ')}`
      }
      else if (missingHeaders.length > 3) {
        status = 'warning'
        message = `Some security headers missing: ${missingHeaders.slice(0, 3).join(', ')}`
      }
      else {
        status = 'warning'
        message = `Minor security headers missing: ${missingHeaders.join(', ')}`
      }
    }

    checks.push({
      name: 'Security Headers',
      status,
      message,
      details: {
        headerAnalysis,
        summary: {
          total: Object.keys(securityHeaders).length,
          present: presentHeaders.length,
          missing: missingHeaders.length,
          presentHeaders,
          missingHeaders,
        },
        allResponseHeaders: Object.fromEntries(headers.entries()),
      },
    })
  }
  catch (error: any) {
    checks.push({
      name: 'Security Headers',
      status: 'error',
      message: `Security headers check failed: ${error.message}`,
      details: { errorType: error.name, errorMessage: error.message },
    })
  }

  // Content Security Analysis
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) })
    const html = await response.text()

    const contentAnalysis: any = {
      pageSize: html.length,
      inlineScripts: [],
      externalScripts: [],
      mixedContent: [],
      forms: [],
      iframes: [],
      summary: {
        totalInlineScripts: 0,
        totalExternalScripts: 0,
        mixedContentCount: 0,
        formsCount: 0,
        iframesCount: 0,
      },
    }

    // Analyze inline scripts
    const inlineScriptMatches = html.match(/<script(?![^>]*src=)[^>]*>[\s\S]*?<\/script>/gi) || []
    contentAnalysis.summary.totalInlineScripts = inlineScriptMatches.length
    contentAnalysis.inlineScripts = inlineScriptMatches.slice(0, 5).map((script, index) => ({
      index: index + 1,
      hasNonce: script.includes('nonce='),
      hasIntegrity: script.includes('integrity='),
      content: script.replace(/<\/?script[^>]*>/gi, '').trim().substring(0, 200),
      length: script.length,
      potentialIssues: [
        !script.includes('nonce=') && 'Missing nonce attribute',
        script.includes('eval(') && 'Contains eval() function',
        script.includes('innerHTML') && 'Uses innerHTML (potential XSS)',
        script.includes('document.write') && 'Uses document.write',
      ].filter(Boolean),
    }))

    // Analyze external scripts
    const externalScriptMatches = html.match(/<script[^>]*src=["']([^"']+)["'][^>]*>/gi) || []
    contentAnalysis.summary.totalExternalScripts = externalScriptMatches.length
    contentAnalysis.externalScripts = externalScriptMatches.slice(0, 10).map((script, index) => {
      const srcMatch = script.match(/src=["']([^"']+)["']/)
      const hasIntegrity = script.includes('integrity=')
      const hasCrossorigin = script.includes('crossorigin=')

      return {
        index: index + 1,
        src: srcMatch ? srcMatch[1] : '',
        hasIntegrity,
        hasCrossorigin,
        isSecure: srcMatch ? srcMatch[1].startsWith('https://') : false,
        securityScore: (hasIntegrity ? 1 : 0) + (hasCrossorigin ? 1 : 0) + (srcMatch && srcMatch[1].startsWith('https://') ? 1 : 0),
      }
    })

    // Check for mixed content
    if (url.startsWith('https://')) {
      const mixedContentMatches = html.match(/(?:src|href|action)=["']http:\/\/[^"']+["']/gi) || []
      contentAnalysis.summary.mixedContentCount = mixedContentMatches.length
      contentAnalysis.mixedContent = mixedContentMatches.slice(0, 10).map((resource, index) => {
        const urlMatch = resource.match(/=["']([^"']+)["']/)
        return {
          index: index + 1,
          url: urlMatch ? urlMatch[1] : resource,
          type: resource.includes('src=') ? 'resource' : 'link',
        }
      })
    }

    let status: 'pass' | 'warning' | 'fail' = 'pass'
    let message = 'Content security is well configured'

    const issues = []
    if (contentAnalysis.summary.totalInlineScripts > 5) {
      issues.push(`${contentAnalysis.summary.totalInlineScripts} inline scripts`)
    }
    if (contentAnalysis.summary.mixedContentCount > 0) {
      issues.push(`${contentAnalysis.summary.mixedContentCount} mixed content resources`)
    }

    if (issues.length > 0) {
      status = contentAnalysis.summary.mixedContentCount > 0 ? 'fail' : 'warning'
      message = `Content security issues: ${issues.join(', ')}`
    }

    checks.push({
      name: 'Content Security Analysis',
      status,
      message,
      details: contentAnalysis,
    })
  }
  catch (error: any) {
    checks.push({
      name: 'Content Security Analysis',
      status: 'error',
      message: `Content analysis failed: ${error.message}`,
      details: { errorType: error.name, errorMessage: error.message },
    })
  }

  // Package Vulnerability Check (simplified for test scan)
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) })
    const html = await response.text()

    const vulnerablePackages = []
    let totalVulns = 0

    // Quick check for common vulnerable libraries in script tags
    const scriptMatches = html.match(/<script[^>]*src=["']([^"']+)["'][^>]*>/gi) || []
    for (const script of scriptMatches) {
      const srcMatch = script.match(/src=["']([^"']+)["']/)
      if (srcMatch) {
        const scriptUrl = srcMatch[1].toLowerCase()

        // Check for known vulnerable library patterns
        if (scriptUrl.includes('jquery') && (scriptUrl.includes('2.') || scriptUrl.includes('3.0') || scriptUrl.includes('3.1') || scriptUrl.includes('3.2') || scriptUrl.includes('3.3') || scriptUrl.includes('3.4'))) {
          vulnerablePackages.push('jQuery (potentially vulnerable version detected)')
          totalVulns++
        }
        if (scriptUrl.includes('lodash') && scriptUrl.includes('4.17.1')) {
          vulnerablePackages.push('Lodash (vulnerable version 4.17.1x detected)')
          totalVulns++
        }
        if (scriptUrl.includes('bootstrap') && (scriptUrl.includes('3.') || scriptUrl.includes('4.0') || scriptUrl.includes('4.1.0') || scriptUrl.includes('4.1.1'))) {
          vulnerablePackages.push('Bootstrap (potentially vulnerable version detected)')
          totalVulns++
        }
        if (scriptUrl.includes('moment') && !scriptUrl.includes('dayjs')) {
          vulnerablePackages.push('Moment.js (deprecated library with known issues)')
          totalVulns++
        }
        if (scriptUrl.includes('angular') && scriptUrl.includes('1.')) {
          vulnerablePackages.push('AngularJS 1.x (end-of-life with security issues)')
          totalVulns++
        }
      }
    }

    let vulnStatus: 'pass' | 'warning' | 'fail' = 'pass'
    let vulnMessage = 'No vulnerable packages detected'

    if (totalVulns > 0) {
      if (totalVulns >= 3) {
        vulnStatus = 'fail'
        vulnMessage = `Multiple vulnerable packages detected (${totalVulns})`
      }
      else {
        vulnStatus = 'warning'
        vulnMessage = `${totalVulns} potentially vulnerable package${totalVulns > 1 ? 's' : ''} detected`
      }
    }

    checks.push({
      name: 'Package Vulnerabilities',
      status: vulnStatus,
      message: vulnMessage,
      details: {
        vulnerablePackages,
        totalVulnerabilities: totalVulns,
        detectionMethod: 'CDN script analysis',
        note: 'This is a simplified check. Full vulnerability assessment requires deeper analysis.',
      },
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

  return checks
}

export default defineEventHandler(async (event: any) => {
  const { requireRole } = await import('../../utils/session')
  await requireRole(event, ['admin', 'manager'])

  const body = await readBody(event)

  if (!body.url) {
    return { error: 'URL is required' }
  }

  let targetUrl = body.url
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = `https://${targetUrl}`
  }

  try {
    const checks = await testSecurityScan(targetUrl)

    // Calculate score
    const weights = { pass: 100, warning: 60, fail: 0, error: 30 }
    const score = Math.round(checks.reduce((sum, check) => sum + weights[check.status], 0) / checks.length)

    const hasErrors = checks.some(c => c.status === 'error')
    const hasFails = checks.some(c => c.status === 'fail')
    const hasWarnings = checks.some(c => c.status === 'warning')

    let overallStatus: 'secure' | 'warnings' | 'vulnerable' | 'error'
    if (hasErrors) overallStatus = 'error'
    else if (hasFails) overallStatus = 'vulnerable'
    else if (hasWarnings) overallStatus = 'warnings'
    else overallStatus = 'secure'

    return {
      url: targetUrl,
      scannedAt: new Date().toISOString(),
      overallStatus,
      score,
      checks,
    }
  }
  catch (error: any) {
    return {
      error: `Security scan failed: ${error.message}`,
    }
  }
})
