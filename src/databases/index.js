const SQLite3Database = require('./sqlite3')
const PostgreSQLDatabase = require('./pg')

const drivers = {
  pg: () => {
    return new PostgreSQLDatabase({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    })
  },
  sqlite3: () => {
    return new SQLite3Database({
      path: process.env.DB_PATH,
    })
  }
}

module.exports = function () {
  const driver = process.env.DB_DRIVER

  if (driver in drivers) {
    console.log(`Using ${driver} database`)
    return drivers[driver]()
  }

  throw new Error(`Invalid database driver: ${driver}`)
}
