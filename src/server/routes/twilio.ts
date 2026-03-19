import { Router } from 'express'
import { db } from '../db.js'
import { members, events, rsvps, destinations } from '../schema.js'
import { eq, and } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import { parseInboundSms } from '../sms.js'

export const twilioRouter = Router()

// Twilio inbound SMS webhook
twilioRouter.post('/webhook', async (req, res) => {
  try {
    const from: string = req.body.From || ''
    const body: string = req.body.Body || ''

    console.log(`[Twilio] Inbound from ${from}: "${body}"`)

    // Find member by phone
    const member = await db.query.members.findFirst({ where: eq(members.phone, from) })
    if (!member) {
      res.set('Content-Type', 'text/xml')
      return res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>You're not on our list yet! Sign up at our website.</Message></Response>`)
    }

    // Find their most recent pending RSVP
    const pendingRsvps = await db.select().from(rsvps)
      .where(and(eq(rsvps.memberId, member.id), eq(rsvps.status, 'pending')))

    if (pendingRsvps.length === 0) {
      res.set('Content-Type', 'text/xml')
      return res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>Thanks ${member.name}! No pending invites right now.</Message></Response>`)
    }

    // Use most recent pending RSVP
    const rsvp = pendingRsvps[pendingRsvps.length - 1]
    const event = await db.query.events.findFirst({ where: eq(events.id, rsvp.eventId) })
    const { status, voteIndex } = parseInboundSms(body)

    let destinationVoteId: string | null = null
    let replyMsg = ''

    if (voteIndex !== null) {
      const eventDests = await db.select().from(destinations).where(eq(destinations.eventId, rsvp.eventId))
      const voted = eventDests[voteIndex - 1]
      if (voted) {
        destinationVoteId = voted.id
      }
    }

    await db.update(rsvps).set({
      status,
      destinationVoteId,
      respondedAt: new Date().toISOString(),
    }).where(eq(rsvps.id, rsvp.id))

    if (status === 'yes') {
      replyMsg = `Awesome, ${member.name}! 🚲 See you at ${event?.title || 'the ride'}!`
      if (destinationVoteId) {
        const dest = await db.query.destinations.findFirst({ where: eq(destinations.id, destinationVoteId) })
        if (dest) replyMsg += ` Your vote for ${dest.name} is in.`
      }
    } else {
      replyMsg = `No worries, ${member.name}! We'll miss you. Hope to see you next time! 🚲`
    }

    res.set('Content-Type', 'text/xml')
    res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${replyMsg}</Message></Response>`)
  } catch (err) {
    console.error('[Twilio] Webhook error:', err)
    res.set('Content-Type', 'text/xml')
    res.send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`)
  }
})

// Validate event delegate token
twilioRouter.get('/event-token/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params
    const token = req.query.token as string
    if (!token) return res.status(400).json({ error: 'token required' })

    const event = await db.query.events.findFirst({ where: eq(events.id, eventId) })
    if (!event?.eventToken || event.eventToken !== token) return res.status(401).json({ error: 'Invalid token' })

    const dests = await db.select().from(destinations).where(eq(destinations.eventId, eventId))
    const allRsvps = await db.select().from(rsvps).where(eq(rsvps.eventId, eventId))
    const allMembers = await db.select().from(members)

    const rsvpList = allRsvps.map(r => ({
      ...r,
      member: allMembers.find(m => m.id === r.memberId),
      destinationVote: dests.find(d => d.id === r.destinationVoteId),
    }))

    res.json({ event, destinations: dests, rsvps: rsvpList })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})
