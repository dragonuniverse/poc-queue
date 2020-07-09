const { Client } = require('pg')

;(async () => {
  const client = new Client()
  await client.connect()

  await client.query(`
    CREATE TABLE IF NOT EXISTS "queue"
    (
    	"id" SERIAL PRIMARY KEY,
    	"data" JSON NOT NULL,
    	"timestamp" TIMESTAMP NOT NULL
    )
  `)
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_queue_timestamp ON queue(timestamp)
  `)

  async function publish(data, delay) {
    await client.query(
      `INSERT INTO "queue" ("data", "timestamp")
      VALUES (
        $1,
        CURRENT_TIMESTAMP + ($2 * INTERVAL '1 SECOND')
      )`,
      [data, delay]
    )
  }

  await publish({ a: 'b' }, 5)

  async function nextEvent() {
    const res = await client.query(`
      DELETE FROM "queue"
      WHERE "id" = (
        SELECT "id" FROM "queue"
        WHERE "timestamp" <= CURRENT_TIMESTAMP
        ORDER BY "timestamp"
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING *
    `)
    return res.rows[0]
  }

  async function subscribe(handler) {
    while (true) {
      try {
        await client.query(`BEGIN`)
        console.log('try to select the next event')
        const event = await nextEvent()
        if (event) {
          console.log('event with id %d found', event.id)
          await handler(event)
          console.log('event successfully handled')
        } else {
          await new Promise((resolve, reject) => {
            setTimeout(() => { resolve() }, 1000);
          })
        }
        await client.query(`COMMIT`)
      } catch (e) {
        console.log('error: %s', e.message)
        await client.query(`ROLLBACK`)
        throw e
      }
    }
  }

  await subscribe(async (event) => {
    console.log(event)
  })

  await client.end()
})()
