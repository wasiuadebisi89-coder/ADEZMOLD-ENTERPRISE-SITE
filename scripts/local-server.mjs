// Local server: serves the production build (dist/) and the real API handlers
// with an IN-MEMORY store. For development and tests only: nothing is saved
// to Firestore and data disappears when the server stops.
//   npm run build && npm run serve:local   ->  http://localhost:4174
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLeadHandler } from '../server/handler.js';
import { createMemoryStore } from '../server/store.js';
import { checklist, consultation } from '../server/leads.js';
import { createDownloadHandler } from '../server/download.js';
import { createAdminHandler } from '../server/admin.js';
import { createFirebaseAuthService } from '../server/auth.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.txt': 'text/plain', '.xml': 'application/xml', '.pdf': 'application/pdf' };

export function startLocalServer({ port = 4174, store = createMemoryStore(), env = { DOWNLOAD_TOKEN_SECRET: 'local-dev-only-secret' }, mailer, authService, adminOptions = {} } = {}) {
  const getStore = () => store;
  const api = {
    '/api/consultation': createLeadHandler({ ...consultation, getStore, env, mailer }),
    '/api/checklist': createLeadHandler({ ...checklist, getStore, env, mailer }),
    '/api/checklist-download': createDownloadHandler({ getStore, env }),
  };
  // Lead register: needs an auth service (tests inject one; or set FIREBASE_AUTH_EMULATOR_HOST).
  const admin = createAdminHandler({
    ...adminOptions,
    getStore,
    env,
    getAuthService: () => authService ?? createFirebaseAuthService({ ...process.env, ...env }),
  });

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (api[url.pathname]) return api[url.pathname](req, res);
    if (url.pathname === '/api/admin' || url.pathname.startsWith('/api/admin/')) return admin(req, res);
    if (url.pathname.startsWith('/api/')) {
      res.statusCode = 404;
      return res.end('{"ok":false}');
    }
    let file = path.join(root, decodeURIComponent(url.pathname));
    if (!file.startsWith(root)) {
      res.statusCode = 400;
      return res.end();
    }
    try {
      if (!(await stat(file)).isFile()) throw new Error();
    } catch {
      file = path.join(root, 'index.html'); // SPA fallback, as in vercel.json
    }
    res.setHeader('Content-Type', types[path.extname(file)] ?? 'application/octet-stream');
    res.end(await readFile(file));
  });

  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, store, url: `http://localhost:${port}` })));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { url } = await startLocalServer({ port: Number(process.env.PORT ?? 4174) });
  console.log(`Local site + API (in-memory store) on ${url}`);
}
