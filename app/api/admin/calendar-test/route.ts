import { NextRequest, NextResponse } from 'next/server'
import { requireAdminAuth, handleRouteError } from '@/lib/auth'
import { google } from 'googleapis'
import { pacificDayBounds, pacificToday } from '@/lib/time'

function createOAuthClient(refreshToken: string) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'urn:ietf:wg:oauth:2.0:oob'
  )
  oauth2Client.setCredentials({ refresh_token: refreshToken })
  return oauth2Client
}

export async function GET(request: NextRequest) {
  try {
    requireAdminAuth(request)

    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date') || pacificToday()

    const results: any = {
      date,
      envVarsPresent: {
        GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET: !!process.env.GOOGLE_CLIENT_SECRET,
        PERSONAL_GOOGLE_REFRESH_TOKEN: !!process.env.PERSONAL_GOOGLE_REFRESH_TOKEN,
        PINECONE_GOOGLE_REFRESH_TOKEN: !!process.env.PINECONE_GOOGLE_REFRESH_TOKEN,
        PERSONAL_CALENDAR_IDS: !!process.env.PERSONAL_CALENDAR_IDS,
        PINECONE_CALENDAR_ID: !!process.env.PINECONE_CALENDAR_ID,
      },
      personalCalendar: { status: 'not_tested', events: [] },
      pineconeCalendar: { status: 'not_tested', events: [] },
    }

    const calendar = google.calendar({ version: 'v3' })
    const { start: startOfDay, end: endOfDay } = pacificDayBounds(date)

    // Test personal calendar
    if (process.env.PERSONAL_GOOGLE_REFRESH_TOKEN && process.env.PERSONAL_CALENDAR_IDS) {
      try {
        const personalAuth = createOAuthClient(process.env.PERSONAL_GOOGLE_REFRESH_TOKEN)
        const personalEvents = await calendar.events.list({
          auth: personalAuth,
          calendarId: process.env.PERSONAL_CALENDAR_IDS,
          timeMin: startOfDay.toISOString(),
          timeMax: endOfDay.toISOString(),
          singleEvents: true,
          orderBy: 'startTime',
        })
        results.personalCalendar = {
          status: 'connected',
          calendarId: process.env.PERSONAL_CALENDAR_IDS,
          eventCount: personalEvents.data.items?.length || 0,
          events: (personalEvents.data.items || []).map(e => ({
            summary: e.summary,
            start: e.start?.dateTime || e.start?.date,
            end: e.end?.dateTime || e.end?.date,
            allDay: !e.start?.dateTime,
          }))
        }
      } catch (err: any) {
        results.personalCalendar = {
          status: 'error',
          error: err.message,
          calendarId: process.env.PERSONAL_CALENDAR_IDS,
        }
      }
    }

    // Test pinecone calendar
    if (process.env.PINECONE_GOOGLE_REFRESH_TOKEN && process.env.PINECONE_CALENDAR_ID) {
      try {
        const pineconeAuth = createOAuthClient(process.env.PINECONE_GOOGLE_REFRESH_TOKEN)
        const pineconeEvents = await calendar.events.list({
          auth: pineconeAuth,
          calendarId: process.env.PINECONE_CALENDAR_ID,
          timeMin: startOfDay.toISOString(),
          timeMax: endOfDay.toISOString(),
          singleEvents: true,
          orderBy: 'startTime',
        })
        results.pineconeCalendar = {
          status: 'connected',
          calendarId: process.env.PINECONE_CALENDAR_ID,
          eventCount: pineconeEvents.data.items?.length || 0,
          events: (pineconeEvents.data.items || []).map(e => ({
            summary: e.summary,
            start: e.start?.dateTime || e.start?.date,
            end: e.end?.dateTime || e.end?.date,
            allDay: !e.start?.dateTime,
          }))
        }
      } catch (err: any) {
        results.pineconeCalendar = {
          status: 'error',
          error: err.message,
          calendarId: process.env.PINECONE_CALENDAR_ID,
        }
      }
    }

    return NextResponse.json(results)
  } catch (error) {
    return handleRouteError(error, 'Calendar test error')
  }
}
