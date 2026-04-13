import sgMail from '@sendgrid/mail'
import { BookingData } from './availability'

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY!)
const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'pinecone.pickup.crew@gmail.com'

// Common email styles
const emailStyles = `
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background-color: #FDFAF4;
      margin: 0;
      padding: 20px;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: white;
      border-radius: 8px;
      padding: 32px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }
    .header {
      text-align: center;
      margin-bottom: 32px;
    }
    .brand {
      color: #2D5016;
      font-size: 24px;
      font-weight: bold;
      margin: 0;
    }
    .content {
      color: #333;
      line-height: 1.6;
      margin-bottom: 24px;
    }
    .details {
      background-color: #F0F5E8;
      padding: 20px;
      border-radius: 6px;
      margin: 24px 0;
      border-left: 4px solid #2D5016;
    }
    .button {
      display: inline-block;
      background-color: #E8650A;
      color: white;
      padding: 16px 32px;
      text-decoration: none;
      border-radius: 24px;
      font-weight: 500;
      margin: 20px 0;
    }
    .contact {
      color: #666;
      font-size: 14px;
      border-top: 1px solid #eee;
      padding-top: 20px;
      margin-top: 32px;
    }
  </style>
`

export async function sendConfirmationEmail(booking: BookingData) {
  try {
    const serviceType = booking.service_type === 'pickup_only' ? 'Pick Up Only' : 'Pick Up + Haul Away'
    const formattedDate = new Date(booking.scheduled_date).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })

    const html = `
      ${emailStyles}
      <body>
        <div class="container">
          <div class="header">
            <h1 class="brand">Pinecone Pick Up Crew</h1>
          </div>

          <div class="content">
            <h2 style="color: #2D5016;">You're on the schedule! 🌲</h2>
            <p>Hi ${booking.first_name},</p>
            <p>Bruce, Zoë and Chase are coming!</p>

            <div class="details">
              <strong>Your Pick Up Details:</strong><br>
              📅 ${formattedDate} at ${booking.scheduled_time}<br>
              📍 ${booking.address}<br>
              🌲 ${serviceType} - $${booking.price}<br>
            </div>

            <p><strong>Payment is cash or Venmo to Bruce on the day</strong></p>

            <p>Questions? Need to reschedule? Call or text Bruce at <strong>858-220-5674</strong> or email us at <strong>pinecone.pickup.crew@gmail.com</strong></p>
          </div>

          <div class="contact">
            Looking forward to clearing your yard! 🌲<br>
            — Bruce, Zoë & Chase
          </div>
        </div>
      </body>
    `

    const msg = {
      to: booking.email,
      from: fromEmail,
      subject: `You're on the schedule! 🌲 ${formattedDate} at ${booking.scheduled_time}`,
      html,
    }

    await sgMail.send(msg)
    console.log('Confirmation email sent successfully to:', booking.email)
  } catch (error) {
    console.error('Error sending confirmation email:', error)
    throw new Error('Failed to send confirmation email')
  }
}

export async function sendDayBeforeReminder(booking: BookingData) {
  try {
    const formattedDate = new Date(booking.scheduled_date).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    })

    const html = `
      ${emailStyles}
      <body>
        <div class="container">
          <div class="header">
            <h1 class="brand">Pinecone Pick Up Crew</h1>
          </div>

          <div class="content">
            <h2 style="color: #2D5016;">See you tomorrow! 🌲</h2>
            <p>Hi ${booking.first_name},</p>
            <p>Just a reminder — we're coming tomorrow!</p>

            <div class="details">
              📅 ${formattedDate} at ${booking.scheduled_time}<br>
              📍 ${booking.address}
            </div>

            <p><strong>Payment is cash or Venmo to Bruce on the day</strong></p>

            <p>Need to reschedule? Call or text Bruce at <strong>858-220-5674</strong></p>
          </div>

          <div class="contact">
            See you tomorrow! 🌲<br>
            — Bruce, Zoë & Chase
          </div>
        </div>
      </body>
    `

    const msg = {
      to: booking.email,
      from: fromEmail,
      subject: 'See you tomorrow! Pinecone Pick Up reminder 🌲',
      html,
    }

    await sgMail.send(msg)
    console.log('Day before reminder sent successfully to:', booking.email)
  } catch (error) {
    console.error('Error sending day before reminder:', error)
    throw new Error('Failed to send day before reminder')
  }
}

export async function sendHourBeforeReminder(booking: BookingData) {
  try {
    const html = `
      ${emailStyles}
      <body>
        <div class="container">
          <div class="header">
            <h1 class="brand">Pinecone Pick Up Crew</h1>
          </div>

          <div class="content">
            <h2 style="color: #2D5016;">We're on our way! 🌲</h2>
            <p>Hi ${booking.first_name},</p>
            <p>The crew is getting ready! See you in about an hour.</p>

            <div class="details">
              🕐 ${booking.scheduled_time}<br>
              📍 ${booking.address}
            </div>

            <p><strong>Payment is cash or Venmo to Bruce on the day</strong></p>
          </div>

          <div class="contact">
            Almost there! 🌲<br>
            — Bruce, Zoë & Chase
          </div>
        </div>
      </body>
    `

    const msg = {
      to: booking.email,
      from: fromEmail,
      subject: "We're on our way! See you in about an hour 🌲",
      html,
    }

    await sgMail.send(msg)
    console.log('Hour before reminder sent successfully to:', booking.email)
  } catch (error) {
    console.error('Error sending hour before reminder:', error)
    throw new Error('Failed to send hour before reminder')
  }
}

export async function sendReviewRequest(booking: BookingData) {
  try {
    const reviewUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/review?booking=${booking.id}`

    const html = `
      ${emailStyles}
      <body>
        <div class="container">
          <div class="header">
            <h1 class="brand">Pinecone Pick Up Crew</h1>
          </div>

          <div class="content">
            <h2 style="color: #2D5016;">How did we do? 🌲</h2>
            <p>Hi ${booking.first_name},</p>
            <p>Thanks for having us! We hope you love your pinecone-free yard.</p>

            <p style="text-align: center;">
              <a href="${reviewUrl}" class="button">Leave a Quick Review</a>
            </p>

            <p style="text-align: center; color: #666;">It only takes 30 seconds and helps us grow!</p>
          </div>

          <div class="contact">
            Thanks again! 🌲<br>
            — Bruce, Zoë & Chase
          </div>
        </div>
      </body>
    `

    const msg = {
      to: booking.email,
      from: fromEmail,
      subject: 'How did we do? 🌲',
      html,
    }

    await sgMail.send(msg)
    console.log('Review request sent successfully to:', booking.email)
  } catch (error) {
    console.error('Error sending review request:', error)
    throw new Error('Failed to send review request')
  }
}