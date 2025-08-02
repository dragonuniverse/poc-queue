This PoC should ensure PostgreSQL is usable as our message queue system.

## Try it out

### With SQLite3 (only single worker)

* Run `npm start`

### With PostgreSQL

* Run `docker-compose up`
* Run in another terminal `npm start`
* See the output like:
  ```
  try to select the next event
  try to select the next event
  event with id 19 found
  { id: 19, timestamp: 2020-07-09T15:05:34.134Z, data: { a: 'b' } }
  event successfully handled
  try to select the next event
  ```

## Requirements

* Message needs to be delivered exactly once
* Message needs to have a delay
* Message needs to be readable/changeable/deleteable after publishing

## Solution

### Table structure

The table we use in the database is simple, we use a serial id, the data as json
column and the timestamp when the event should be handled.

```javascript
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
```

The timestamp needs to be indexed, because we wanna filter and order by.

### Publish an event

For publishing a new event we just insert a new row into the queue table.

```javascript
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
```

### Subscribe for the events

Here the magic comes. We use a query selecting the next event of the queue which
is ready and which will be deleted after the handling.

```javascript
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
```

This needs to be surounded by a transaction. If there is no event selected, we
can just wait a second before we try to select again. If there is an event, we
give it to a handler. In both cases we commit the transaction afterwards or
rollback if there is an error.

```javascript
async function subscribe(handler) {
  while (true) {
    try {
      await client.query(`BEGIN`)
      const event = await nextEvent()
      if (event) {
        await handler(event)
      } else {
        await new Promise((resolve, reject) => {
          setTimeout(() => { resolve() }, 1000);
        })
      }
      await client.query(`COMMIT`)
    } catch (e) {
      await client.query(`ROLLBACK`)
      throw e
    }
  }
}

await subscribe(async (event) => {
  console.log(event)
})
```

## Additional features

### Dead queue

With the example solution the worker would stop handling events if there is an
error thrown in the handler. To avoid these we could add another try/catch for
the handler and insert the event into a dead queue for logging purpose if there
is an error thrown.

### Scaling up workers

In this example it's possible to scale up by run more workers. But this only
works if the events are independently from each other and the order doesn't
matter. If the order is important it could also be possible a partitioning
concept is used. A column specify a partition key and every partition key is
limited to be handled by the same worker to ensure the right order.

## Conclusion

PostgreSQL fits in pretty well in the requirements. It can be extended easily
with powerful features and especially if it's needed to join other data to the
events, read, change or delete events after publishing before handling it's
a unique solution to have the message queue together with the application data
in the same database.

But there are also downsides. There are benchmarks with says handling thousands
of events per second. But it won't reach the performance a dedicated optimized
message queue engine will have.
