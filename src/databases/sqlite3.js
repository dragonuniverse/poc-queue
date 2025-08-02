const sqlite3 = require('sqlite3').verbose()

class SQLite3Database {
  constructor(config) {
    this.db = new sqlite3.Database(config.path)
  }

  query(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err)
        else resolve({ rows })
      })
    })
  }

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) reject(err)
        else resolve({ lastID: this.lastID, changes: this.changes })
      })
    })
  }

  async connect() {
    // SQLite3 ist bereits verbunden, wenn die Datei geöffnet wird
    return Promise.resolve()
  }

  async initialize(types) {
    // Tabelle erstellen mit INTEGER timestamp für UNIX-Timestamps
    const quotedTypes = types.map(type => `'${type}'`).join(',')
    await this.run(`
      CREATE TABLE IF NOT EXISTS "queue"
      (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT,
        "type" TEXT NOT NULL CHECK ("type" IN (${quotedTypes})),
        "data" TEXT NOT NULL,
        "timestamp" INTEGER NOT NULL
      )
    `)

    await this.run(`
      CREATE INDEX IF NOT EXISTS idx_queue_timestamp ON queue(timestamp)
    `)
  }

  async publish(data, delay, type) {
    // UNIX-Timestamp in Sekunden
    const timestamp = Math.floor(Date.now() / 1000) + delay
    await this.run(
      `INSERT INTO "queue" ("type", "data", "timestamp")
      VALUES (?, ?, ?)`,
      [type, JSON.stringify(data), timestamp]
    )
  }

  async nextEvent() {
    const currentTimestamp = Math.floor(Date.now() / 1000)
    const res = await this.query(`
      DELETE FROM "queue"
      WHERE "id" = (
        SELECT "id" FROM "queue"
        WHERE "timestamp" <= ?
        ORDER BY "timestamp"
        LIMIT 1
      )
      RETURNING *
    `, [currentTimestamp])
    
    if (res.rows[0]) {
      res.rows[0].data = JSON.parse(res.rows[0].data)
    }
    
    return res.rows[0]
  }

  async beginTransaction() {}

  async commitTransaction() {}

  async rollbackTransaction() {}

  async close() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }
}

module.exports = SQLite3Database
