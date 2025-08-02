const { Client } = require('pg')

class PostgreSQLDatabase {
  constructor(config = {}) {
    this.client = new Client(config)
  }

  async connect() {
    await this.client.connect()
  }

  async initialize(types) {
    const quotedTypes = types.map(type => `'${type}'`).join(',')
    await this.client.query(`
      CREATE TYPE IF NOT EXISTS queue_type_enum AS ENUM (${quotedTypes})
    `)

    // Tabelle erstellen
    await this.client.query(`
      CREATE TABLE IF NOT EXISTS "queue"
      (
        "id" SERIAL PRIMARY KEY,
        "type" queue_type_enum NOT NULL,
        "data" JSON NOT NULL,
        "timestamp" TIMESTAMP NOT NULL
      )
    `)

    await this.client.query(`
      CREATE INDEX IF NOT EXISTS idx_queue_timestamp ON queue(timestamp)
    `)
  }

  async publish(data, delay, type) {
    await this.client.query(
      `INSERT INTO "queue" ("type", "data", "timestamp")
      VALUES (
        $1,
        $2,
        CURRENT_TIMESTAMP + ($3 * INTERVAL '1 SECOND')
      )`,
      [type, data, delay]
    )
  }

  async nextEvent() {
    const res = await this.client.query(`
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

  async beginTransaction() {
    await this.client.query('BEGIN')
  }

  async commitTransaction() {
    await this.client.query('COMMIT')
  }

  async rollbackTransaction() {
    await this.client.query('ROLLBACK')
  }

  async close() {
    await this.client.end()
  }
}

module.exports = PostgreSQLDatabase
