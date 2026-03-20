// server/api/security/scan.post.ts
import { defineEventHandler, readBody, createError } from 'h3'
import { requireRole } from '../../utils/session'

interface SecurityScanRequest {
  url: string
  siteId?: string
  checks?: string[]
}

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

// Security checks to perform
const SECURITY_CHECKS = {
  https: 'HTTPS Usage',
  headers: 'Security Headers',
  cookies: 'Cookie Security',
  forms: 'Form Security',
  links: 'External Links',
  content: 'Content Security'
}

async function checkHttps(url: string): Promise<SecurityCheck> {
  try {
    if (url.startsWith('https://')) {
      // Try to fetch to see if HTTPS is properly configured
      const response = await fetch(url, { 
        method: 'HEAD',
        signal: AbortSignal.timeout(10000)
      })
      
      return {
        name: SECURITY_CHECKS.https,
        status: response.ok ? 'pass' : 'warning',
        message: response.ok ? 'Site uses HTTPS correctly' : 'HTTPS enabled but response issues detected'
      }
    } else {
      return {
        name: SECURITY_CHECKS.https,
        status: 'fail',
        message: 'Site does not use HTTPS - data transmitted in plain text'
      }
    }
  } catch (error: any) {
    return {
      name: SECURITY_CHECKS.https,
      status: 'error',
      message: `HTTPS check failed: ${error.message}`
    }
  }
}

async function checkSecurityHeaders(url: string): Promise<SecurityCheck> {
  try {
    const response = await fetch(url, { 
      method: 'HEAD',
      signal: AbortSignal.timeout(10000)
    })
    
    const headers = response.headers
    const requiredHeaders = {
      'x-frame-options': 'X-Frame-Options',
      'x-content-type-options': 'X-Content-Type-Options',
      'x-xss-protection': 'X-XSS-Protection',
      'strict-transport-security': 'Strict-Transport-Security',
      'content-security-policy': 'Content-Security-Policy'
    }
    
    const missingHeaders: string[] = []
    const presentHeaders: string[] = []
    
    for (const [header, displayName] of Object.entries(requiredHeaders)) {
      if (headers.has(header)) {
        presentHeaders.push(displayName)
      } else {
        missingHeaders.push(displayName)
      }
    }
    
    let status: 'pass' | 'warning' | 'fail' = 'pass'
    let message = 'All security headers present'
    
    if (missingHeaders.length > 0) {
      if (missingHeaders.length > 3) {
        status = 'fail'
        message = `Critical security headers missing: ${missingHeaders.join(', ')}`
      } else {
        status = 'warning'
        message = `Some security headers missing: ${missingHeaders.join(', ')}`
      }
    }
    
    return {
      name: SECURITY_CHECKS.headers,
      status,
      message,
      details: {
        present: presentHeaders,
        missing: missingHeaders
      }
    }
  } catch (error: any) {
    return {
      name: SECURITY_CHECKS.headers,
      status: 'error',
      message: `Security headers check failed: ${error.message}`
    }
  }
}

async function checkCookieSecurity(url: string): Promise<SecurityCheck> {
  try {
    const response = await fetch(url, { 
      signal: AbortSignal.timeout(10000)
    })
    
    const setCookieHeaders = response.headers.getSetCookie?.() || []
    
    if (setCookieHeaders.length === 0) {
      return {
        name: SECURITY_CHECKS.cookies,
        status: 'pass',
        message: 'No cookies set by the site'
      }
    }
    
    const issues: string[] = []
    let secureCount = 0
    let httpOnlyCount = 0
    
    for (const cookie of setCookieHeaders) {
      if (!cookie.toLowerCase().includes('secure')) {
        issues.push('Cookie without Secure flag detected')
      } else {
        secureCount++
      }
      
      if (!cookie.toLowerCase().includes('httponly')) {
        issues.push('Cookie without HttpOnly flag detected')
      } else {
        httpOnlyCount++
      }
    }
    
    const totalCookies = setCookieHeaders.length
    let status: 'pass' | 'warning' | 'fail' = 'pass'
    let message = 'All cookies properly secured'
    
    if (issues.length > 0) {
      if (secureCount === 0 || httpOnlyCount === 0) {
        status = 'fail'
        message = `Critical cookie security issues: ${Array.from(new Set(issues)).join(', ')}`
      } else {
        status = 'warning'
        message = `Some cookie security issues: ${Array.from(new Set(issues)).join(', ')}`
      }
    }
    
    return {
      name: SECURITY_CHECKS.cookies,
      status,
      message,
      details: {
        totalCookies,
        secureCount,
        httpOnlyCount,
        issues: Array.from(new Set(issues))
      }
    }
  } catch (error: any) {
    return {
      name: SECURITY_CHECKS.cookies,
      status: 'error',
      message: `Cookie security check failed: ${error.message}`
    }
  }
}

async function checkFormSecurity(url: string): Promise<SecurityCheck> {
  try {
    const response = await fetch(url, { 
      signal: AbortSignal.timeout(10000)
    })
    
    const html = await response.text()
    const formMatches = html.match(/<form[^>]*>/gi) || []
    
    if (formMatches.length === 0) {
      return {
        name: SECURITY_CHECKS.forms,
        status: 'pass',
        message: 'No forms detected on the page'
      }
    }
    
    const issues: string[] = []
    let httpsActionCount = 0
    
    for (const form of formMatches) {
      // Check for HTTPS action URLs
      const actionMatch = form.match(/action=["']([^"']+)["']/i)
      if (actionMatch) {
        const action = actionMatch[1]
        if (action.startsWith('http://')) {
          issues.push('Form submitting to insecure HTTP URL')
        } else if (action.startsWith('https://') || action.startsWith('/')) {
          httpsActionCount++
        }
      }
      
      // Check for method
      const methodMatch = form.match(/method=["']([^"']+)["']/i)
      if (methodMatch && methodMatch[1].toLowerCase() === 'get') {
        if (form.toLowerCase().includes('password') || form.toLowerCase().includes('login')) {
          issues.push('Sensitive form using GET method')
        }
      }
    }
    
    let status: 'pass' | 'warning' | 'fail' = 'pass'
    let message = 'Forms appear to be secure'
    
    if (issues.length > 0) {
      status = issues.some(i => i.includes('HTTP URL') || i.includes('GET method')) ? 'fail' : 'warning'
      message = `Form security issues: ${Array.from(new Set(issues)).join(', ')}`
    }
    
    return {
      name: SECURITY_CHECKS.forms,
      status,
      message,
      details: {
        totalForms: formMatches.length,
        httpsActionCount,
        issues: Array.from(new Set(issues))
      }
    }
  } catch (error: any) {
    return {
      name: SECURITY_CHECKS.forms,
      status: 'error',
      message: `Form security check failed: ${error.message}`
    }
  }
}

async function checkExternalLinks(url: string): Promise<SecurityCheck> {
  try {
    const response = await fetch(url, { 
      signal: AbortSignal.timeout(10000)
    })
    
    const html = await response.text()
    const linkMatches = html.match(/<a[^>]*href=["']([^"']+)["'][^>]*>/gi) || []
    
    const externalLinks: string[] = []
    const insecureLinks: string[] = []
    const noRelLinks: string[] = []
    
    for (const link of linkMatches) {
      const hrefMatch = link.match(/href=["']([^"']+)["']/i)
      if (hrefMatch) {
        const href = hrefMatch[1]
        
        // Check if external link
        if (href.startsWith('http://') || href.startsWith('https://')) {
          const linkDomain = new URL(href).hostname
          const siteDomain = new URL(url).hostname
          
          if (linkDomain !== siteDomain) {
            externalLinks.push(href)
            
            // Check for HTTP links
            if (href.startsWith('http://')) {
              insecureLinks.push(href)
            }
            
            // Check for missing rel attributes
            if (!link.includes('rel=')) {
              noRelLinks.push(href)
            }
          }
        }
      }
    }
    
    let status: 'pass' | 'warning' | 'fail' = 'pass'
    let message = 'External links are secure'
    
    if (insecureLinks.length > 0) {
      status = 'warning'
      message = `${insecureLinks.length} external links use insecure HTTP`
    }
    
    if (noRelLinks.length > 0 && status === 'pass') {
      status = 'warning'
      message = `${noRelLinks.length} external links missing rel attributes`
    }
    
    return {
      name: SECURITY_CHECKS.links,
      status,
      message,
      details: {
        totalExternalLinks: externalLinks.length,
        insecureLinks: insecureLinks.length,
        noRelLinks: noRelLinks.length
      }
    }
  } catch (error: any) {
    return {
      name: SECURITY_CHECKS.links,
      status: 'error',
      message: `External links check failed: ${error.message}`
    }
  }
}

async function checkContentSecurity(url: string): Promise<SecurityCheck> {
  try {
    const response = await fetch(url, { 
      signal: AbortSignal.timeout(10000)
    })
    
    const html = await response.text()
    const issues: string[] = []
    
    // Check for inline scripts
    const inlineScripts = html.match(/<script(?![^>]*src=)[^>]*>/gi) || []
    if (inlineScripts.length > 0) {
      issues.push(`${inlineScripts.length} inline script(s) detected`)
    }
    
    // Check for inline styles
    const inlineStyles = html.match(/style=["'][^"']*["']/gi) || []
    if (inlineStyles.length > 5) { // Allow some inline styles
      issues.push(`Excessive inline styles detected (${inlineStyles.length})`)
    }
    
    // Check for mixed content (HTTP resources on HTTPS page)
    if (url.startsWith('https://')) {
      const httpResources = html.match(/(?:src|href|action)=["']http:\/\/[^"']+["']/gi) || []
      if (httpResources.length > 0) {
        issues.push(`${httpResources.length} mixed content resource(s) detected`)
      }
    }
    
    let status: 'pass' | 'warning' | 'fail' = 'pass'
    let message = 'Content security looks good'
    
    if (issues.length > 0) {
      if (issues.some(i => i.includes('mixed content'))) {
        status = 'fail'
        message = `Critical content security issues: ${issues.join(', ')}`
      } else {
        status = 'warning'
        message = `Content security issues: ${issues.join(', ')}`
      }
    }
    
    return {
      name: SECURITY_CHECKS.content,
      status,
      message,
      details: {
        inlineScripts: inlineScripts.length,
        inlineStyles: inlineStyles.length,
        issues
      }
    }
  } catch (error: any) {
    return {
      name: SECURITY_CHECKS.content,
      status: 'error',
      message: `Content security check failed: ${error.message}`
    }
  }
}

function calculateSecurityScore(checks: SecurityCheck[]): number {
  const weights = {
    pass: 100,
    warning: 60,
    fail: 0,
    error: 30
  }
  
  const totalScore = checks.reduce((sum, check) => sum + weights[check.status], 0)
  return Math.round(totalScore / checks.length)
}

function generateRecommendations(checks: SecurityCheck[]): string[] {
  const recommendations: string[] = []
  
  for (const check of checks) {
    if (check.status === 'fail' || check.status === 'warning') {
      switch (check.name) {
        case SECURITY_CHECKS.https:
          if (check.status === 'fail') {
            recommendations.push('Enable HTTPS with a valid SSL/TLS certificate')
          }
          break
        case SECURITY_CHECKS.headers:
          recommendations.push('Implement missing security headers to protect against common attacks')
          break
        case SECURITY_CHECKS.cookies:
          recommendations.push('Add Secure and HttpOnly flags to all cookies')
          break
        case SECURITY_CHECKS.forms:
          recommendations.push('Use HTTPS for all form submissions and POST method for sensitive data')
          break
        case SECURITY_CHECKS.links:
          recommendations.push('Add rel="noopener noreferrer" to external links and use HTTPS URLs')
          break
        case SECURITY_CHECKS.content:
          recommendations.push('Implement Content Security Policy and avoid inline scripts/styles')
          break
      }
    }
  }
  
  return Array.from(new Set(recommendations))
}

export default defineEventHandler(async (event) => {
  // Require admin or manager role
  await requireRole(event, ['admin', 'manager'])
  
  const body = await readBody<SecurityScanRequest>(event)
  
  if (!body.url) {
    throw createError({
      statusCode: 400,
      statusMessage: 'URL is required'
    })
  }
  
  // Validate URL
  let targetUrl: string
  try {
    const parsedUrl = new URL(body.url.includes('://') ? body.url : `https://${body.url}`)
    targetUrl = parsedUrl.toString()
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid URL format'
    })
  }
  
  // Determine which checks to run
  const requestedChecks = body.checks || Object.keys(SECURITY_CHECKS)
  const validChecks = requestedChecks.filter(check => check in SECURITY_CHECKS)
  
  if (validChecks.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No valid security checks specified'
    })
  }
  
  // Run security checks in parallel
  const checkMap: Record<string, (url: string) => Promise<SecurityCheck>> = {
    https: checkHttps,
    headers: checkSecurityHeaders,
    cookies: checkCookieSecurity,
    forms: checkFormSecurity,
    links: checkExternalLinks,
    content: checkContentSecurity,
  }
  
  try {
    const checks: SecurityCheck[] = await Promise.all(
      validChecks.map(check => checkMap[check](targetUrl))
    )
    
    // Calculate overall status and score
    const score = calculateSecurityScore(checks)
    const hasErrors = checks.some(c => c.status === 'error')
    const hasFails = checks.some(c => c.status === 'fail')
    const hasWarnings = checks.some(c => c.status === 'warning')
    
    let overallStatus: SecurityScanResult['overallStatus']
    if (hasErrors) {
      overallStatus = 'error'
    } else if (hasFails) {
      overallStatus = 'vulnerable'
    } else if (hasWarnings) {
      overallStatus = 'warnings'
    } else {
      overallStatus = 'secure'
    }
    
    const recommendations = generateRecommendations(checks)
    
    const result: SecurityScanResult = {
      url: targetUrl,
      scannedAt: new Date().toISOString(),
      overallStatus,
      score,
      checks,
      recommendations
    }
    
    return result
    
  } catch (error: any) {
    throw createError({
      statusCode: 500,
      statusMessage: `Security scan failed: ${error.message}`
    })
  }
})