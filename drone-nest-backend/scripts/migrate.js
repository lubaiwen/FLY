const { pool } = require('../config/database')

async function migrate() {
  const conn = await pool.getConnection()
  
  try {
    await conn.query('ALTER TABLE nests ADD COLUMN current_charging INT DEFAULT 0 COMMENT "current charging drones"')
    console.log('Added current_charging column to nests')
  } catch(e) {
    if (e.code === 'ER_DUP_FIELDNAME') console.log('current_charging column already exists')
    else console.log('Error adding current_charging:', e.message)
  }
  
  try {
    await conn.query('ALTER TABLE drones ADD COLUMN longitude DECIMAL(10, 6)')
    console.log('Added longitude column to drones')
  } catch(e) {
    if (e.code === 'ER_DUP_FIELDNAME') console.log('longitude column already exists')
    else console.log('Error adding longitude:', e.message)
  }
  
  try {
    await conn.query('ALTER TABLE drones ADD COLUMN latitude DECIMAL(10, 6)')
    console.log('Added latitude column to drones')
  } catch(e) {
    if (e.code === 'ER_DUP_FIELDNAME') console.log('latitude column already exists')
    else console.log('Error adding latitude:', e.message)
  }
  
  try {
    await conn.query('ALTER TABLE nests MODIFY COLUMN max_drones INT DEFAULT 5')
    console.log('Updated max_drones default to 5')
  } catch(e) {
    console.log('Error updating max_drones:', e.message)
  }
  
  try {
    await conn.query(`
      UPDATE nests n 
      SET current_charging = (
        SELECT COUNT(*) 
        FROM drones d 
        WHERE d.bind_nest_id = n.nest_id AND d.status = 2
      )
    `)
    console.log('Updated current_charging values')
  } catch(e) {
    console.log('Error updating current_charging values:', e.message)
  }
  
  const [rows] = await conn.query('SELECT nest_id, max_drones, current_charging FROM nests LIMIT 10')
  console.table(rows)
  
  conn.release()
  console.log('Migration completed!')
}

migrate().then(() => process.exit(0)).catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
