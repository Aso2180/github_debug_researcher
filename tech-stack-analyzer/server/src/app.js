import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { authMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import reposRouter from './routes/repos.js';
import riskRouter from './routes/risk.js';
import dependenciesRouter from './routes/dependencies.js';
import qiitaTrendsRouter from './routes/qiitaTrends.js';
import analyzeRouter from './routes/analyze.js';
import languageGraphRouter from './routes/languageGraph.js';
import usecaseGuideRouter from './routes/usecaseGuide.js';
import { query } from './db/pool.js';
import { PORT } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

app.get('/api/health', async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(503).json({ status: 'error', error: err.message });
  }
});

app.use('/api', authMiddleware, reposRouter);
app.use('/api', authMiddleware, riskRouter);
app.use('/api', authMiddleware, dependenciesRouter);
app.use('/api', authMiddleware, qiitaTrendsRouter);
app.use('/api', authMiddleware, analyzeRouter);
app.use('/api', authMiddleware, languageGraphRouter);
app.use('/api', authMiddleware, usecaseGuideRouter);

// 本番: React ビルド成果物を静的配信
const clientDist = path.join(__dirname, '../client/dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use(errorHandler);

export const server = app.listen(PORT, () =>
  console.log(`API server listening on :${PORT}`)
);

export default app;
