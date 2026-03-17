import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const members = sqliteTable('members', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  phone: text('phone').notNull().unique(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
})

export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  eventDate: text('event_date').notNull(), // ISO date string YYYY-MM-DD
  meetTime: text('meet_time').notNull().default('18:00'), // HH:MM
  description: text('description'),
  status: text('status').notNull().default('active'), // active | cancelled
  finalDestinationId: text('final_destination_id'),
  invitesSentAt: text('invites_sent_at'),
  groupChatCreatedAt: text('group_chat_created_at'),
  conversationSid: text('conversation_sid'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
})

export const destinations = sqliteTable('destinations', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  mapsUrl: text('maps_url'), // Google Maps bike directions URL
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
})

export const rsvps = sqliteTable('rsvps', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  memberId: text('member_id').notNull().references(() => members.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('pending'), // pending | yes | no
  destinationVoteId: text('destination_vote_id'),
  respondedAt: text('responded_at'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
})

export const rideSuggestions = sqliteTable('ride_suggestions', {
  id: text('id').primaryKey(),
  memberName: text('member_name').notNull(),
  memberPhone: text('member_phone'),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
})

export const eventAdmins = sqliteTable('event_admins', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  memberId: text('member_id').references(() => members.id),
  delegateName: text('delegate_name').notNull(),
  token: text('token').notNull().unique(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
})
