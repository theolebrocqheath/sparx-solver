import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { exec } from 'child_process';
import { SparxBot } from './src/sparx-bot.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3000;

function openBrowser(url) {
  const cmds = { darwin: 'open', win32: 'start', linux: 'xdg-open' };
  const cmd = cmds[process.platform];
  if (cmd) exec(`${cmd} ${url}`);
}

app.use(express.json());

const activeSessions = new Map();
let schoolsCache = null;

app.get('/api/status', (req, res) => {
  res.json({ ok: true, version: '1.0.0' });
});

app.get('/api/schools', async (req, res) => {
  try {
    if (!schoolsCache) {
      const resp = await fetch('https://static.sparx-learning.com/sl/spx001/data.txt');
      const b64 = await resp.text();
      schoolsCache = JSON.parse(Buffer.from(b64, 'base64').toString());
    }
    const q = (req.query.q || '').toLowerCase();
    if (!q || q.length < 2) return res.json([]);
    const matches = schoolsCache
      .filter((s) => s.n.toLowerCase().includes(q) || s.t.toLowerCase().includes(q))
      .slice(0, 10)
      .map((s) => ({ slug: s.u, id: s.i, name: s.n, town: s.t, address: s.a }));
    res.json(matches);
  } catch (err) {
    res.status(500).json({ error: 'Could not load schools' });
  }
});

app.post('/api/login', async (req, res) => {
  const { schoolSlug, username, password } = req.body;
  if (!schoolSlug || !username || !password) {
    return res.status(400).json({ error: 'School, username, and password are required' });
  }

  const sessionId = crypto.randomUUID();
  const bot = new SparxBot();

  try {
    const result = await bot.login(schoolSlug, username, password);
    activeSessions.set(sessionId, bot);
    res.json({ sessionId, ...result });
  } catch (err) {
    await bot.close();
    res.status(401).json({ error: err.message });
  }
});

app.post('/api/login-google', async (req, res) => {
  const { schoolSlug } = req.body;
  if (!schoolSlug) {
    return res.status(400).json({ error: 'School is required' });
  }

  const sessionId = crypto.randomUUID();
  const bot = new SparxBot();

  try {
    const result = await bot.loginWithGoogle(schoolSlug);
    activeSessions.set(sessionId, bot);
    res.json({ sessionId, ...result });
  } catch (err) {
    await bot.close();
    res.status(401).json({ error: err.message });
  }
});

app.get('/api/homework/:sessionId', async (req, res) => {
  const bot = activeSessions.get(req.params.sessionId);
  if (!bot) return res.status(404).json({ error: 'Session not found' });

  try {
    const homework = await bot.getHomework();
    res.json({ homework });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/solve/:sessionId', async (req, res) => {
  const bot = activeSessions.get(req.params.sessionId);
  if (!bot) return res.status(404).json({ error: 'Session not found' });

  const { taskUrl } = req.body;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    await bot.solveTask(taskUrl, sendEvent);
    sendEvent({ type: 'complete', message: 'Task completed!' });
  } catch (err) {
    sendEvent({ type: 'error', message: err.message });
  } finally {
    res.end();
  }
});

app.post('/api/logout/:sessionId', async (req, res) => {
  const bot = activeSessions.get(req.params.sessionId);
  if (bot) {
    await bot.close();
    activeSessions.delete(req.params.sessionId);
  }
  res.json({ ok: true });
});

app.use(express.static(join(__dirname, 'public')));

app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n  Sparx Solver running at ${url}\n`);
  openBrowser(url);
});
