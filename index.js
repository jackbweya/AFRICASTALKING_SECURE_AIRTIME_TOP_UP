import africastalking from 'africastalking'
import express from 'express'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 9000

// Initialize Africa's Talking
const AT_USERNAME = process.env.AT_USERNAME
const AT_API_KEY = process.env.AT_API_KEY

if (!AT_USERNAME || !AT_API_KEY) {
  console.error("Error: Missing Africa's Talking credentials. Please set AT_USERNAME and AT_API_KEY environment variables.")
  process.exit(1)
}

const AT = africastalking({
  username: AT_USERNAME,
  apiKey: AT_API_KEY
})

const insights = AT.INSIGHTS
const airtime = AT.AIRTIME

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

const DB = new Map() // Simulated in-memory DB

// Invoke sim swap check, save the phone and requestId to DB
// When we get a callback, we retrieve requestId from DB and check the phone, then will proceed with top up.

app.get('/', async (req, res) => {
  const { number, amount } = req.query

  if (!number || !amount) {
    return res.status(400).send("Missing 'number' or 'amount' query parameters.")
  }

  console.log({ number, amount })
  const phone = `+254${number.slice(-9)}` // Ensure number is in international format
  const results = await insights.checkSimSwapState([phone])
  console.log(Object.keys(results))
  const { requestId } = results.responses[0]

  // Save to DB
  DB.set(requestId, { number, amount })

  // See what is DB
  console.log(DB.values())

  res.send(`Sim swap check initiated for ${number}. Request ID: ${requestId}`)
})

// Will be callback for POST from AfricasTalking
app.post('/api/sim-swap/status', async (req, res) => {
  const { requestId, lastSimSwapDate } = req.body

  const isWithin3Months = (dateStr) => {
    const threeMonthsAgo = new Date()
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
    const lastSwapDate = new Date(dateStr)
    return lastSwapDate >= threeMonthsAgo
  }

  if (isWithin3Months(lastSimSwapDate)) {
    const message = 'Top-up declined due to recent SIM swap activity.'
    return res.status(400).send(message)
  } else {
    // Proceed with top-up
    const record = DB.get(requestId)
    if (!record) {
      return res.status(404).send('Request ID not found.')
    }

    const { number, amount } = record

    try {
      const phoneNumber = `+254${number.slice(-9)}` // Ensure number is in international format

      const response = await airtime.send({
        recipients: [{
          phoneNumber,
          amount,
          currencyCode: 'KES'
        }]
      })
      console.log('Airtime top-up response:', response)
      res.send(`Airtime top-up of ${amount} to ${number} successful.`)
    } catch (error) {
      console.error('Error during airtime top-up:', error)
      res.status(500).send('Error during airtime top-up.')
    }
  }
})

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
})
