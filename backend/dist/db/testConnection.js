import 'dotenv/config';
import { pool } from './pool.js';
try {
    const [rows] = await pool.query('SELECT DATABASE() AS databaseName');
    console.log('MySQL connection successful:', rows);
}
catch (error) {
    console.error('MySQL connection failed:', error);
    process.exitCode = 1;
}
finally {
    await pool.end();
}
