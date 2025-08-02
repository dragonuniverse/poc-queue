const database = require('./databases')
const types = require('./types')

;(async () => {
  const db = database()
  
  try {
    await db.connect()
    await db.initialize(Object.keys(types))

    // Test-Event veröffentlichen
    await db.publish({ a: 'b' }, 5, 'move')

    while (true) {
      try {
        await db.beginTransaction()
        
        console.log('try to select the next event')
        const event = await db.nextEvent()
        
        if (event) {
          console.log('event with id %d found', event.id)
          await types[event.type](event)
          console.log('event successfully handled')
        } else {
          await new Promise((resolve) => {
            setTimeout(resolve, 1000)
          })
        }
        
        await db.commitTransaction()
      } catch (error) {
        console.log('Error: ', error)
        await db.rollbackTransaction()
        throw error
      }
    }
  } catch (error) {
    console.error('Error: ', error)
  } finally {
    await db.close()
  }
})()
