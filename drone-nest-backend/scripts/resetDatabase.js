const mysql = require('mysql2/promise');

async function resetDatabase() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: '123456'
  });

  try {
    console.log('正在删除旧数据库...');
    await connection.query('DROP DATABASE IF EXISTS drone_nest_system');
    console.log('旧数据库已删除');

    console.log('正在创建新数据库...');
    await connection.query('CREATE DATABASE drone_nest_system CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    console.log('新数据库已创建');

    console.log('数据库重置完成！');
  } catch (error) {
    console.error('操作失败:', error.message);
  } finally {
    await connection.end();
  }
}

resetDatabase();