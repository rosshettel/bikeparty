import cron from 'node-cron'
import { db } from './db.js'
import { events } from './schema.js'
import { eq, and } from 'drizzle-orm'
import { sendInvites, createGroupChat } from './sms.js'
import { format, addDays, parseISO, isToday, isSameDay } from 'date-fns'

export function startScheduler() {
  // Daily at 9am: send 2-day invites
  cron.schedule('0 9 * * *', async () => {
    console.log('[Scheduler] Checking for events in 2 days...')
    try {
      const twoDaysFromNow = format(addDays(new Date(), 2), 'yyyy-MM-dd')
      const upcomingEvents = await db.select().from(events)
        .where(and(eq(events.status, 'active'), eq(events.eventDate, twoDaysFromNow)))

      for (const event of upcomingEvents) {
        if (!event.invitesSentAt) {
          console.log(`[Scheduler] Sending invites for event: ${event.title}`)
          const sent = await sendInvites(event.id)
          console.log(`[Scheduler] Sent ${sent} invites for ${event.title}`)
        }
      }
    } catch (err) {
      console.error('[Scheduler] Error sending 2-day invites:', err)
    }
  })

  // Daily at 4pm: create group chat for today's events
  cron.schedule('0 16 * * *', async () => {
    console.log('[Scheduler] Checking for group chats to create...')
    try {
      const today = format(new Date(), 'yyyy-MM-dd')
      const todayEvents = await db.select().from(events)
        .where(and(eq(events.status, 'active'), eq(events.eventDate, today)))

      for (const event of todayEvents) {
        if (!event.groupChatCreatedAt) {
          console.log(`[Scheduler] Creating group chat for: ${event.title}`)
          const sid = await createGroupChat(event.id)
          if (sid) {
            console.log(`[Scheduler] Group chat created: ${sid}`)
          }
        }
      }
    } catch (err) {
      console.error('[Scheduler] Error creating group chats:', err)
    }
  })

  console.log('[Scheduler] Started (2-day invites at 9am, group chat at 4pm)')
}
