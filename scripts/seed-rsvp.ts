import { v4 as uuidv4 } from 'uuid'
import { db, runMigrations } from '../src/server/db.js'
import { events, destinations, members, rsvps } from '../src/server/schema.js'
import { eq } from 'drizzle-orm'

async function main() {
  runMigrations()

  // Reuse an existing test event/member if seed has been run before, otherwise create fresh
  const TEST_EVENT_TITLE = 'Sunset Cruise (preview)'
  const TEST_MEMBER_PHONE = '+15555550100'

  let event = await db.query.events.findFirst({ where: eq(events.title, TEST_EVENT_TITLE) })
  if (!event) {
    const today = new Date()
    today.setDate(today.getDate() + 7)
    const eventDate = today.toISOString().slice(0, 10)
    const id = uuidv4()
    await db.insert(events).values({
      id,
      title: TEST_EVENT_TITLE,
      eventDate,
      meetTime: '18:30',
      description: "Easy ride out to the coast. Bring a light, we'll roll back after dark.",
      startPointName: 'Dolores Park',
      startPointAddress: 'Dolores Park, San Francisco, CA',
      eventToken: uuidv4(),
    })
    event = await db.query.events.findFirst({ where: eq(events.id, id) })!

    // A few sample destinations with real addresses for the route render
    const dests = [
      { name: 'Ocean Beach', address: 'Ocean Beach, San Francisco, CA' },
      { name: 'Twin Peaks', address: 'Twin Peaks, San Francisco, CA' },
      { name: 'Crissy Field', address: 'Crissy Field, San Francisco, CA' },
    ]
    for (const d of dests) {
      await db.insert(destinations).values({
        id: uuidv4(),
        eventId: id,
        name: d.name,
        address: d.address,
      })
    }
  }

  let member = await db.query.members.findFirst({ where: eq(members.phone, TEST_MEMBER_PHONE) })
  if (!member) {
    const id = uuidv4()
    await db.insert(members).values({
      id,
      name: 'Test Rider',
      phone: TEST_MEMBER_PHONE,
    })
    member = await db.query.members.findFirst({ where: eq(members.id, id) })!
  }

  let rsvp = await db.query.rsvps.findFirst({
    where: eq(rsvps.memberId, member!.id),
  })
  let token: string
  if (!rsvp || rsvp.eventId !== event!.id) {
    token = uuidv4()
    await db.insert(rsvps).values({
      id: uuidv4(),
      eventId: event!.id,
      memberId: member!.id,
      status: 'pending',
      token,
    })
  } else {
    if (!rsvp.token) {
      token = uuidv4()
      await db.update(rsvps).set({ token }).where(eq(rsvps.id, rsvp.id))
    } else {
      token = rsvp.token
    }
  }

  const baseUrl = process.env.PREVIEW_BASE_URL || 'http://localhost:5173'
  const url = `${baseUrl}/rsvp/${event!.id}?token=${token}`
  console.log('\n✅ Test RSVP ready')
  console.log(`   Member: ${member!.name} (${member!.phone})`)
  console.log(`   Event:  ${event!.title} — ${event!.eventDate} ${event!.meetTime}`)
  console.log(`\n👉 ${url}\n`)
  process.exit(0)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
