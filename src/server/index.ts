import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { runMigrations } from './db.js'
import { publicRouter } from './routes/public.js'
import { adminRouter } from './routes/admin.js'
import { twilioRouter } from './routes/twilio.js'
import { startScheduler } from './scheduler.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
const PORT = parseInt(process.env.PORT || '3001', 10)

app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true })) // for Twilio webhook form data

// API routes
app.use('/api/public', publicRouter)
app.use('/api/admin', adminRouter)
app.use('/api/twilio', twilioRouter)

// Health check
app.get('/api/health', (req, res) => res.json({ ok: true }))

// Serve static client files in production
const clientDist = path.join(__dirname, '../client')
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(clientDist))
  // SPA fallback
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'))
  })
}

// Start
runMigrations()
startScheduler()

app.listen(PORT, () => {
  console.log(`🚲 Bike Party server running on port ${PORT}`)
})
