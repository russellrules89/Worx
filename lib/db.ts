import { neon } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;
export const sql = databaseUrl ? neon(databaseUrl) : null;

export function requireDatabase() {
  if (!sql) throw new Error('DATABASE_URL is not configured');
  return sql;
}
