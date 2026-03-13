import { config } from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import typeormDataSource from '../config/typeorm.config';

config();

const run = async () => {
  const sqlPath = path.join(__dirname, '../../drop_all_tables.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  await typeormDataSource.initialize();
  try {
    await typeormDataSource.query(sql);
    console.log('Schema drop complete.');
  } finally {
    await typeormDataSource.destroy();
  }
};

run().catch((error) => {
  console.error('Schema drop failed:', error);
  process.exit(1);
});
