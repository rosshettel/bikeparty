import { Router } from 'express'
import { db } from '../db.js'
import { members, rideSuggestions } from '../schema.js'
import { eq } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'

export const publicRouter = Router()

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return `+${digits}`
}

// Register member(s)
publicRouter.post('/members', async (req, res) => {
  try {
    const { people } = req.body as { people: Array<{ name: string; phone: string }> }
    if (!people || !Array.isArray(people) || people.length === 0) {
      return res.status(400).json({ error: 'Provide at least one person' })
    }

    const results = []
    for (const person of people) {
      if (!person.name?.trim() || !person.phone?.trim()) continue
      const phone = normalizePhone(person.phone)

      // Upsert: if phone exists, update name
      const existing = await db.query.members.findFirst({ where: eq(members.phone, phone) })
      if (existing) {
        await db.update(members).set({ name: person.name.trim() }).where(eq(members.phone, phone))
        results.push({ ...existing, name: person.name.trim(), updated: true })
      } else {
        const member = { id: uuidv4(), name: person.name.trim(), phone }
        await db.insert(members).values(member)
        results.push(member)
      }
    }

    res.json({ success: true, members: results })
  } catch (err: any) {
    console.error('POST /members error:', err)
    res.status(500).json({ error: err.message })
  }
})

// Submit ride suggestion
publicRouter.post('/suggestions', async (req, res) => {
  try {
    const { memberName, memberPhone, name, description } = req.body
    if (!memberName?.trim() || !name?.trim()) {
      return res.status(400).json({ error: 'Name and suggestion required' })
    }

    const suggestion = {
      id: uuidv4(),
      memberName: memberName.trim(),
      memberPhone: memberPhone?.trim() ? normalizePhone(memberPhone.trim()) : null,
      name: name.trim(),
      description: description?.trim() || null,
    }
    await db.insert(rideSuggestions).values(suggestion)
    res.json({ success: true, suggestion })
  } catch (err: any) {
    console.error('POST /suggestions error:', err)
    res.status(500).json({ error: err.message })
  }
})
