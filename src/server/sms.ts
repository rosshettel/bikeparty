import twilio from 'twilio'
import { db } from './db.js'
import { members, events, destinations, rsvps } from './schema.js'
import { eq, and } from 'drizzle-orm'

const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN
const fromNumber = process.env.TWILIO_PHONE_NUMBER
const conversationsSid = process.env.TWILIO_CONVERSATIONS_SERVICE_SID

function getClient() {
  if (!accountSid || !authToken) {
    throw new Error('Twilio credentials not configured')
  }
  return twilio(accountSid, authToken)
}

export async function sendSms(to: string, body: string): Promise<void> {
  const client = getClient()
  await client.messages.create({ from: fromNumber!, to, body })
}

export async function sendInvites(eventId: string): Promise<number> {
  const event = await db.query.events.findFirst({ where: eq(events.id, eventId) })
  if (!event) throw new Error('Event not found')

  const allMembers = await db.select().from(members)
  const eventDests = await db.select().from(destinations).where(eq(destinations.eventId, eventId))

  const client = getClient()
  let sent = 0

  for (const member of allMembers) {
    // Create or update RSVP to pending
    const existing = await db.query.rsvps.findFirst({
      where: and(eq(rsvps.eventId, eventId), eq(rsvps.memberId, member.id))
    })
    if (!existing) {
      const { v4: uuidv4 } = await import('uuid')
      await db.insert(rsvps).values({
        id: uuidv4(),
        eventId,
        memberId: member.id,
        status: 'pending',
      })
    }

    // Build message
    let msg = `Hey ${member.name}! 🚲 Bike Party is in 2 days: ${event.title}\n`
    msg += `📅 ${event.eventDate} at ${event.meetTime}\n\n`
    if (event.description) msg += `${event.description}\n\n`
    msg += `Can you make it?\n`

    if (eventDests.length > 0) {
      msg += `Reply with YES + your destination pick, or NO:\n`
      eventDests.forEach((d, i) => {
        msg += `YES ${i + 1} — ${d.name}\n`
      })
      msg += `YES (no preference)\nNO (can't make it)`
    } else {
      msg += `Reply YES or NO`
    }

    try {
      await client.messages.create({ from: fromNumber!, to: member.phone, body: msg })
      sent++
    } catch (err) {
      console.error(`Failed to send invite to ${member.phone}:`, err)
    }
  }

  // Mark invites sent
  await db.update(events).set({ invitesSentAt: new Date().toISOString() }).where(eq(events.id, eventId))

  return sent
}

export async function sendBlast(eventId: string, message: string): Promise<number> {
  const confirmedRsvps = await db.select().from(rsvps)
    .where(and(eq(rsvps.eventId, eventId), eq(rsvps.status, 'yes')))

  const allMembers = await db.select().from(members)
  const client = getClient()
  let sent = 0

  // Get confirmed member IDs
  const confirmedMemberIds = new Set(confirmedRsvps.map(r => r.memberId))
  const confirmedMembers = allMembers.filter(m => confirmedMemberIds.has(m.id))

  for (const member of confirmedMembers) {
    try {
      await client.messages.create({ from: fromNumber!, to: member.phone, body: message })
      sent++
    } catch (err) {
      console.error(`Blast failed for ${member.phone}:`, err)
    }
  }
  return sent
}

export async function sendBlastToAll(message: string): Promise<number> {
  const allMembers = await db.select().from(members)
  const client = getClient()
  let sent = 0
  for (const member of allMembers) {
    try {
      await client.messages.create({ from: fromNumber!, to: member.phone, body: message })
      sent++
    } catch (err) {
      console.error(`Blast failed for ${member.phone}:`, err)
    }
  }
  return sent
}

export async function createGroupChat(eventId: string): Promise<string | null> {
  const event = await db.query.events.findFirst({ where: eq(events.id, eventId) })
  if (!event) return null

  const confirmedRsvps = await db.select().from(rsvps)
    .where(and(eq(rsvps.eventId, eventId), eq(rsvps.status, 'yes')))
  const confirmedMemberIds = confirmedRsvps.map(r => r.memberId)
  const confirmedMembers = await db.select().from(members)
  const ridersToday = confirmedMembers.filter(m => confirmedMemberIds.includes(m.id))

  if (ridersToday.length === 0) {
    console.log(`No confirmed riders for event ${eventId}`)
    return null
  }

  const client = getClient()

  // Determine final destination
  let destMsg = ''
  if (event.finalDestinationId) {
    const dest = await db.query.destinations.findFirst({ where: eq(destinations.id, event.finalDestinationId) })
    if (dest) {
      destMsg = `\n🗺️ Destination: ${dest.name}`
      if (dest.mapsUrl) destMsg += `\n${dest.mapsUrl}`
    }
  }

  const welcomeMsg = `🚲 ${event.title} Group Chat!\nMeet time: ${event.meetTime}${destMsg}\n\nSee you out there!`

  try {
    let conversation
    if (conversationsSid) {
      conversation = await client.conversations.v1.services(conversationsSid).conversations.create({
        friendlyName: event.title,
      })
    } else {
      conversation = await client.conversations.v1.conversations.create({
        friendlyName: event.title,
      })
    }

    // Add each rider as SMS participant
    for (const rider of ridersToday) {
      try {
        const bindingParams = {
          'messagingBinding.address': rider.phone,
          'messagingBinding.proxyAddress': fromNumber!,
        }
        if (conversationsSid) {
          await client.conversations.v1.services(conversationsSid).conversations(conversation.sid).participants.create(bindingParams)
        } else {
          await client.conversations.v1.conversations(conversation.sid).participants.create(bindingParams)
        }
      } catch (err) {
        console.error(`Failed to add ${rider.phone} to conversation:`, err)
      }
    }

    // Send welcome message
    if (conversationsSid) {
      await client.conversations.v1.services(conversationsSid).conversations(conversation.sid).messages.create({ body: welcomeMsg })
    } else {
      await client.conversations.v1.conversations(conversation.sid).messages.create({ body: welcomeMsg })
    }

    // Mark in DB
    await db.update(events).set({
      groupChatCreatedAt: new Date().toISOString(),
      conversationSid: conversation.sid,
    }).where(eq(events.id, eventId))

    console.log(`Group chat created: ${conversation.sid} for event ${eventId}`)
    return conversation.sid
  } catch (err) {
    console.error('Failed to create group chat:', err)
    return null
  }
}

export async function sendDayOfConfirmation(eventId: string): Promise<number> {
  const event = await db.query.events.findFirst({ where: eq(events.id, eventId) })
  if (!event) return 0

  const allMembers = await db.select().from(members)
  const eventDests = await db.select().from(destinations).where(eq(destinations.eventId, eventId))
  const client = getClient()
  let sent = 0

  for (const member of allMembers) {
    let msg = `Hey ${member.name}! 🚲 Bike Party is TONIGHT: ${event.title}\n`
    msg += `📅 ${event.eventDate} at ${event.meetTime}\n`
    if (event.startPointName) msg += `📍 Starting from: ${event.startPointName}\n`
    msg += `\n`

    if (eventDests.length > 0) {
      msg += `Reply YES + destination pick to confirm you're coming:\n`
      eventDests.forEach((d, i) => {
        msg += `YES ${i + 1} — ${d.name}\n`
      })
      msg += `YES (no preference)\nNO (can't make it)`
    } else {
      msg += `Reply YES to confirm you're coming or NO if you can't make it.`
    }

    try {
      await client.messages.create({ from: fromNumber!, to: member.phone, body: msg })
      sent++
    } catch (err) {
      console.error(`Failed to send day-of confirm to ${member.phone}:`, err)
    }
  }

  await db.update(events).set({ dayOfConfirmSentAt: new Date().toISOString() }).where(eq(events.id, eventId))
  return sent
}

export function parseInboundSms(body: string): { status: 'yes' | 'no'; voteIndex: number | null } {
  const upper = body.toUpperCase().trim()
  if (upper.startsWith('NO')) {
    return { status: 'no', voteIndex: null }
  }
  if (upper.startsWith('YES')) {
    const match = upper.match(/YES\s*(\d+)/)
    return { status: 'yes', voteIndex: match ? parseInt(match[1], 10) : null }
  }
  return { status: 'no', voteIndex: null }
}
