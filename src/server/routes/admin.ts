import { Router, Request, Response, NextFunction } from 'express'
import { db } from '../db.js'
import { events, destinations, rsvps, members, rideSuggestions } from '../schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import { sendInvites, sendBlast, sendBlastToAll, createGroupChat } from '../sms.js'

export const adminRouter = Router()

// Strict admin-only middleware
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const token = req.headers['x-admin-token'] || req.query.adminToken
  if (token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
}

// Admin OR valid event-delegate token (for event-scoped routes with :id param)
async function requireAdminOrDelegate(req: Request, res: Response, next: NextFunction) {
  const adminToken = req.headers['x-admin-token'] || req.query.adminToken
  if (adminToken === process.env.ADMIN_TOKEN) {
    ;(req as any).isAdmin = true
    return next()
  }

  const eventToken = (req.headers['x-event-token'] as string) || (req.query.eventToken as string)
  const eventId = req.params.id
  if (eventToken && eventId) {
    const event = await db.query.events.findFirst({ where: eq(events.id, eventId) })
    if (event?.eventToken && event.eventToken === eventToken) {
      ;(req as any).isAdmin = false
      return next()
    }
  }

  return res.status(401).json({ error: 'Unauthorized' })
}

// --- Events (admin only) ---

adminRouter.get('/events', requireAdmin, async (req, res) => {
  try {
    const allEvents = await db.select().from(events).orderBy(desc(events.eventDate))
    res.json(allEvents)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

adminRouter.post('/events', requireAdmin, async (req, res) => {
  try {
    const { title, eventDate, meetTime, description, startPointName, startPointAddress } = req.body
    if (!title?.trim() || !eventDate) {
      return res.status(400).json({ error: 'title and eventDate required' })
    }
    const event = {
      id: uuidv4(),
      title: title.trim(),
      eventDate,
      meetTime: meetTime || '18:00',
      description: description?.trim() || null,
      startPointName: startPointName?.trim() || null,
      startPointAddress: startPointAddress?.trim() || null,
      eventToken: uuidv4(),
    }
    await db.insert(events).values(event)
    res.json(event)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

adminRouter.get('/events/:id', requireAdminOrDelegate, async (req, res) => {
  try {
    const event = await db.query.events.findFirst({ where: eq(events.id, req.params.id) })
    if (!event) return res.status(404).json({ error: 'Not found' })

    const dests = await db.select().from(destinations).where(eq(destinations.eventId, event.id))
    const allRsvps = await db.select().from(rsvps).where(eq(rsvps.eventId, event.id))
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

adminRouter.patch('/events/:id', requireAdmin, async (req, res) => {
  try {
    const { title, eventDate, meetTime, description, status, startPointName, startPointAddress } = req.body
    const updates: Record<string, any> = {}
    if (title !== undefined) updates.title = title
    if (eventDate !== undefined) updates.eventDate = eventDate
    if (meetTime !== undefined) updates.meetTime = meetTime
    if (description !== undefined) updates.description = description
    if (status !== undefined) updates.status = status
    if (startPointName !== undefined) updates.startPointName = startPointName
    if (startPointAddress !== undefined) updates.startPointAddress = startPointAddress
    await db.update(events).set(updates).where(eq(events.id, req.params.id))
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

adminRouter.delete('/events/:id', requireAdmin, async (req, res) => {
  try {
    await db.update(events).set({ status: 'cancelled' }).where(eq(events.id, req.params.id))
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// --- Destinations (admin or delegate) ---

adminRouter.post('/events/:id/destinations', requireAdminOrDelegate, async (req, res) => {
  try {
    const { name, mapsUrl, address } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'name required' })
    const dest = { id: uuidv4(), eventId: req.params.id, name: name.trim(), address: address?.trim() || null, mapsUrl: mapsUrl?.trim() || null }
    await db.insert(destinations).values(dest)
    res.json(dest)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

adminRouter.delete('/events/:id/destinations/:destId', requireAdminOrDelegate, async (req, res) => {
  try {
    await db.delete(destinations).where(and(eq(destinations.id, req.params.destId), eq(destinations.eventId, req.params.id)))
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

adminRouter.post('/events/:id/destinations/:destId/select', requireAdminOrDelegate, async (req, res) => {
  try {
    await db.update(events).set({ finalDestinationId: req.params.destId }).where(eq(events.id, req.params.id))
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// --- SMS Actions ---

adminRouter.post('/events/:id/invite', requireAdmin, async (req, res) => {
  try {
    const sent = await sendInvites(req.params.id)
    res.json({ success: true, sent })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

adminRouter.post('/events/:id/blast', requireAdminOrDelegate, async (req, res) => {
  try {
    const { message, audience } = req.body
    if (!message?.trim()) return res.status(400).json({ error: 'message required' })
    let sent: number
    if (audience === 'all') {
      sent = await sendBlastToAll(message)
    } else {
      sent = await sendBlast(req.params.id, message)
    }
    res.json({ success: true, sent })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

adminRouter.post('/events/:id/groupchat', requireAdminOrDelegate, async (req, res) => {
  try {
    const sid = await createGroupChat(req.params.id)
    res.json({ success: true, conversationSid: sid })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

adminRouter.post('/events/:id/cancel', requireAdmin, async (req, res) => {
  try {
    const { message } = req.body
    await db.update(events).set({ status: 'cancelled' }).where(eq(events.id, req.params.id))
    if (message) {
      await sendBlast(req.params.id, message)
    }
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// --- Delegation (admin only) ---

adminRouter.post('/events/:id/delegate', requireAdmin, async (req, res) => {
  try {
    const { phone } = req.body
    if (!phone?.trim()) return res.status(400).json({ error: 'phone required' })

    const event = await db.query.events.findFirst({ where: eq(events.id, req.params.id) })
    if (!event) return res.status(404).json({ error: 'Event not found' })

    // Ensure the event has a token; generate one if missing (for events created before this feature)
    let token = event.eventToken
    if (!token) {
      token = uuidv4()
      await db.update(events).set({ eventToken: token }).where(eq(events.id, req.params.id))
    }

    const baseUrl = process.env.BASE_URL || 'http://localhost:3001'
    const link = `${baseUrl}/event-admin/${req.params.id}?token=${token}`

    const normalizedPhone = phone.trim().replace(/\D/g, '')
    const e164 = normalizedPhone.startsWith('1') ? `+${normalizedPhone}` : `+1${normalizedPhone}`

    const { sendSms } = await import('../sms.js')
    await sendSms(e164, `You've been given admin access for "${event.title}". Manage it here: ${link}`)

    res.json({ success: true, link })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// --- Members & Suggestions (admin only) ---

adminRouter.get('/members', requireAdmin, async (req, res) => {
  try {
    const allMembers = await db.select().from(members)
    res.json(allMembers)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

adminRouter.get('/suggestions', requireAdmin, async (req, res) => {
  try {
    const suggestions = await db.select().from(rideSuggestions).orderBy(desc(rideSuggestions.createdAt))
    res.json(suggestions)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})
