#!/usr/bin/env node
/**
 * scripts/get-refresh-token.mjs
 *
 * Generates a Google OAuth refresh token via the loopback authorization-code
 * flow. Used to mint PERSONAL_GOOGLE_REFRESH_TOKEN and
 * PINECONE_GOOGLE_REFRESH_TOKEN for the calendar integration in Vercel.
 *
 * WHEN TO RE-RUN:
 *   - A refresh token returns invalid_grant in production.
 *   - Scopes requested by the app change (existing tokens are scope-locked
 *     at issuance).
 *   - The Google account backing either calendar changes.
 *   - GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET rotate.
 *   - The OAuth app is moved back to Testing mode for any reason (7-day
 *     expiry will then apply to all newly issued tokens).
 *
 * USAGE:
 *   GOOGLE_CLIENT_ID=<id> GOOGLE_CLIENT_SECRET=<secret> \
 *     node scripts/get-refresh-token.mjs \
 *     --scope=https://www.googleapis.com/auth/calendar.readonly
 *
 * Typical use is one scope per invocation (e.g. calendar.readonly for the
 * personal calendar, calendar.events for the pinecone calendar). The
 * --scope flag accepts comma-separated multiple scopes if needed, but
 * one-scope-per-run is the default pattern.
 *
 * The script opens a browser for consent, captures the authorization code
 * on http://127.0.0.1:<port>/, and prints the refresh token to stdout.
 * Nothing is written to disk.
 *
 * PREREQS:
 *   - http://127.0.0.1:<port>/ is registered as an Authorized redirect URI
 *     on the OAuth 2.0 Client ID in Google Cloud Console (default port 53682).
 *   - The OAuth app publishing status is "In Production". Otherwise tokens
 *     minted will expire in 7 days regardless of what this script does.
 */
import { google } from 'googleapis'
import http from 'node:http'
import { exec } from 'node:child_process'
import { parseArgs } from 'node:util'
import { randomUUID } from 'node:crypto'

const { values } = parseArgs({
  options: {
    scope: { type: 'string' },
    port: { type: 'string', default: '53682' },
  },
})

if (!values.scope) {
  console.error('error: --scope is required (e.g. --scope=https://www.googleapis.com/auth/calendar.readonly)')
  process.exit(1)
}

const clientId = process.env.GOOGLE_CLIENT_ID
const clientSecret = process.env.GOOGLE_CLIENT_SECRET
if (!clientId || !clientSecret) {
  console.error('error: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in the environment')
  process.exit(1)
}

const port = Number(values.port)
const redirectUri = `http://127.0.0.1:${port}/`
const scopes = values.scope.split(',').map(s => s.trim()).filter(Boolean)
const state = randomUUID()

const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri)
const authUrl = oauth2.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent select_account',
  scope: scopes,
  state,
})

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, redirectUri)
  const code = url.searchParams.get('code')
  const returnedState = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  if (error) {
    res.end(`Auth error: ${error}. Close this tab and check the terminal.`)
    console.error(`error from Google: ${error}`)
    server.close()
    process.exit(1)
    return
  }

  if (!code) {
    res.end('No code in callback. Close this tab.')
    return
  }

  if (returnedState !== state) {
    res.end('State mismatch — possible CSRF. Close this tab and check the terminal.')
    console.error(`error: state mismatch (expected ${state}, got ${returnedState})`)
    server.close()
    process.exit(1)
    return
  }

  try {
    const { tokens } = await oauth2.getToken(code)

    if (!tokens.refresh_token) {
      res.end('No refresh token returned — see terminal.')
      console.error('error: no refresh_token in response.')
      console.error('this usually means Google remembered a prior consent for this client+account.')
      console.error('revoke this app at https://myaccount.google.com/permissions and re-run.')
      server.close()
      process.exit(1)
      return
    }

    res.end('Success. Close this tab and return to the terminal.')
    console.log('')
    console.log('=== REFRESH TOKEN ===')
    console.log(tokens.refresh_token)
    console.log('======================')
    console.log(`scopes granted: ${tokens.scope}`)
    console.log('')
    server.close()
    process.exit(0)
  } catch (e) {
    res.end('Token exchange failed. Check the terminal.')
    console.error('error exchanging code:', e.message)
    server.close()
    process.exit(1)
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`listening on ${redirectUri}`)
  console.log(`auth URL: ${authUrl}`)
  console.log('opening browser for consent...')
  const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start ""' : 'xdg-open'
  exec(`${opener} "${authUrl}"`, err => {
    if (err) {
      console.log('(browser did not open automatically; paste the auth URL above into your browser)')
    }
  })
})
