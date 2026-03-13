import { DataSource, DataSourceOptions } from 'typeorm';
import { config } from 'dotenv';

config();

const rawUrl = process.env.DATABASE_URL;
const dbName = process.env.DATABASE_NAME || process.env.DB_NAME || 'pastor_decks';
let databaseUrl = rawUrl;
if (rawUrl && dbName) {
  try {
    const parsed = new URL(rawUrl);
    if (!parsed.pathname || parsed.pathname === '/') {
      parsed.pathname = `/${dbName}`;
      databaseUrl = parsed.toString();
    }
  } catch {
    databaseUrl = rawUrl;
  }
}

export const typeormConfig: DataSourceOptions = {
  type: 'postgres',
  url: databaseUrl,
  host: databaseUrl ? undefined : process.env.DATABASE_HOST,
  port: databaseUrl ? undefined : parseInt(process.env.DATABASE_PORT || '5432', 10),
  username: databaseUrl ? undefined : process.env.DATABASE_USER,
  password: databaseUrl ? undefined : process.env.DATABASE_PASSWORD,
  database: databaseUrl ? undefined : dbName,
  entities: ['src/**/*.entity{.ts,.js}'],
  migrations: ['src/migrations/*{.ts,.js}'],
  synchronize: false,
};

export default new DataSource(typeormConfig);
