import { Router } from 'express'
import { db } from '../db.js'
import { events, destinations, rsvps, members } from '../schema.js'
import { eq, and } from 'drizzle-orm'

export const rsvpRouter = Router()

async function loadByToken(eventId: string, token: string) {
  if (!token) return null
  const rsvp = await db.query.rsvps.findFirst({
    where: and(eq(rsvps.eventId, eventId), eq(rsvps.token, token)),
  })
  if (!rsvp) return null
  const event = await db.query.events.findFirst({ where: eq(events.id, eventId) })
  if (!event) return null
  const member = await db.query.members.findFirst({ where: eq(members.id, rsvp.memberId) })
  if (!member) return null
  return { rsvp, event, member }
}

rsvpRouter.get('/:eventId', async (req, res) => {
  try {
    const ctx = await loadByToken(req.params.eventId, req.query.token as string)
    if (!ctx) return res.status(401).json({ error: 'Invalid or expired link' })

    const dests = await db.select().from(destinations).where(eq(destinations.eventId, ctx.event.id))
    const allRsvps = await db.select().from(rsvps).where(eq(rsvps.eventId, ctx.event.id))
    const tallies: Record<string, number> = {}
    allRsvps.forEach(r => {
      if (r.status === 'yes' && r.destinationVoteId) {
        tallies[r.destinationVoteId] = (tallies[r.destinationVoteId] || 0) + 1
      }
    })

    res.json({
      event: ctx.event,
      destinations: dests,
      voteTallies: tallies,
      member: { id: ctx.member.id, name: ctx.member.name },
      rsvp: {
        status: ctx.rsvp.status,
        destinationVoteId: ctx.rsvp.destinationVoteId,
        respondedAt: ctx.rsvp.respondedAt,
      },
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

rsvpRouter.post('/:eventId/respond', async (req, res) => {
  try {
    const ctx = await loadByToken(req.params.eventId, req.query.token as string)
    if (!ctx) return res.status(401).json({ error: 'Invalid or expired link' })

    const { status, destinationVoteId } = req.body as {
      status?: 'yes' | 'no'
      destinationVoteId?: string | null
    }

    const updates: Record<string, any> = { respondedAt: new Date().toISOString() }
    if (status === 'yes' || status === 'no') updates.status = status
    if (destinationVoteId !== undefined) {
      if (destinationVoteId === null) {
        updates.destinationVoteId = null
      } else {
        const dest = await db.query.destinations.findFirst({
          where: and(eq(destinations.id, destinationVoteId), eq(destinations.eventId, ctx.event.id)),
        })
        if (!dest) return res.status(400).json({ error: 'Invalid destination' })
        updates.destinationVoteId = destinationVoteId
      }
    }

    await db.update(rsvps).set(updates).where(eq(rsvps.id, ctx.rsvp.id))
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})
