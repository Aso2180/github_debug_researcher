import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// server/.env → 次にリポジトリルートの .env をフォールバックとして読む
config({ path: path.join(__dirname, '../.env') });
config({ path: path.join(__dirname, '../../../.env') });

export const PORT = process.env.PORT !== undefined ? Number(process.env.PORT) : 3000;
export const DASHBOARD_USER = process.env.DASHBOARD_USER || 'admin';
export const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || 'changeme';
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
