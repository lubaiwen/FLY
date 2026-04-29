const mysql = require('mysql2/promise');

async function listDatabases() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: '123456'
  });

  try {
    const [databases] = await connection.query('SHOW DATABASES');
    console.log('所有数据库:');
    databases.forEach(db => console.log('  -', db.Database));
  } catch (error) {
    console.error('错误:', error.message);
  } finally {
    await connection.end();
  }
}

listDatabases();