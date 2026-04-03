import cron from 'node-cron'
import { db } from './db.js'
import { events } from './schema.js'
import { eq, and, lte, isNull, isNotNull } from 'drizzle-orm'
import { sendInvites, sendDayOfConfirmation, createGroupChat } from './sms.js'
import { format, addDays } from 'date-fns'

export function startScheduler() {
  // Every minute: fire scheduled notifications whose datetime has arrived
  cron.schedule('* * * * *', async () => {
    const now = new Date().toISOString()

    try {
      // Heads-up + vote (scheduled)
      const needInvite = await db.select().from(events).where(
        and(eq(events.status, 'active'), isNotNull(events.scheduledInviteAt), lte(events.scheduledInviteAt, now), isNull(events.invitesSentAt))
      )
      for (const event of needInvite) {
        console.log(`[Scheduler] Sending scheduled invites for: ${event.title}`)
        await sendInvites(event.id)
      }

      // Day-of confirmation (scheduled)
      const needDayOf = await db.select().from(events).where(
        and(eq(events.status, 'active'), isNotNull(events.scheduledDayOfConfirmAt), lte(events.scheduledDayOfConfirmAt, now), isNull(events.dayOfConfirmSentAt))
      )
      for (const event of needDayOf) {
        console.log(`[Scheduler] Sending day-of confirmation for: ${event.title}`)
        await sendDayOfConfirmation(event.id)
      }

      // Group chat creation (scheduled)
      const needGroupChat = await db.select().from(events).where(
        and(eq(events.status, 'active'), isNotNull(events.scheduledGroupChatAt), lte(events.scheduledGroupChatAt, now), isNull(events.groupChatCreatedAt))
      )
      for (const event of needGroupChat) {
        console.log(`[Scheduler] Creating scheduled group chat for: ${event.title}`)
        await createGroupChat(event.id)
      }
    } catch (err) {
      console.error('[Scheduler] Error in scheduled notification check:', err)
    }
  })

  // Legacy fallback: daily at 9am for events without scheduled times
  cron.schedule('0 9 * * *', async () => {
    console.log('[Scheduler] Legacy: checking for events in 2 days...')
    try {
      const twoDaysFromNow = format(addDays(new Date(), 2), 'yyyy-MM-dd')
      const upcomingEvents = await db.select().from(events).where(
        and(eq(events.status, 'active'), eq(events.eventDate, twoDaysFromNow), isNull(events.invitesSentAt), isNull(events.scheduledInviteAt))
      )
      for (const event of upcomingEvents) {
        console.log(`[Scheduler] Legacy: sending invites for ${event.title}`)
        await sendInvites(event.id)
      }
    } catch (err) {
      console.error('[Scheduler] Legacy invite error:', err)
    }
  })

  // Legacy fallback: daily at 4pm for events without scheduled group chat time
  cron.schedule('0 16 * * *', async () => {
    console.log('[Scheduler] Legacy: checking for group chats to create...')
    try {
      const today = format(new Date(), 'yyyy-MM-dd')
      const todayEvents = await db.select().from(events).where(
        and(eq(events.status, 'active'), eq(events.eventDate, today), isNull(events.groupChatCreatedAt), isNull(events.scheduledGroupChatAt))
      )
      for (const event of todayEvents) {
        console.log(`[Scheduler] Legacy: creating group chat for ${event.title}`)
        await createGroupChat(event.id)
      }
    } catch (err) {
      console.error('[Scheduler] Legacy group chat error:', err)
    }
  })

  console.log('[Scheduler] Started (per-minute scheduled checks + legacy daily fallbacks)')
}
