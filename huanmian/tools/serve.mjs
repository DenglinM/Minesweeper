import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { realpath as resolveRealPath } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

// The portable implementation also works inside Windows AppContainer previews.
const realpath = promisify(resolveRealPath);

const defaultRoot = fileURLToPath(new URL('../', import.meta.url));
const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8', '.woff2': 'font/woff2',
};

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

/** A local static server; every target is checked again after resolving symlinks. */
export async function createStaticServer({ root = defaultRoot } = {}) {
  const canonicalRoot = await realpath(root);
  return http.createServer(async (request, response) => {
    const finish = (status, message) => {
      response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
      response.end(request.method === 'HEAD' ? undefined : message);
    };
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.setHeader('Allow', 'GET, HEAD');
      finish(405, 'Method not allowed');
      return;
    }
    let pathname;
    try {
      if (!request.url?.startsWith('/')) throw new Error('Invalid request target');
      pathname = decodeURIComponent(request.url.split('?')[0]).replaceAll('\\', '/');
      if (pathname.includes('\0')) throw new Error('Invalid request target');
    } catch {
      finish(400, 'Invalid request target');
      return;
    }
    if (pathname.split('/').some(segment => segment === '..' || (segment.startsWith('.') && segment !== '.'))) {
      finish(403, 'Forbidden');
      return;
    }
    let target = path.resolve(canonicalRoot, `.${pathname}`);
    if (!isInside(canonicalRoot, target)) {
      finish(403, 'Forbidden');
      return;
    }
    try {
      if ((await stat(target)).isDirectory()) target = path.join(target, 'index.html');
      target = await realpath(target);
      if (!isInside(canonicalRoot, target)) {
        finish(403, 'Forbidden');
        return;
      }
      if (!(await stat(target)).isFile()) {
        finish(404, 'Not found');
        return;
      }
      const body = await readFile(target);
      response.writeHead(200, {
        'Content-Type': contentTypes[path.extname(target).toLowerCase()] || 'application/octet-stream',
        'Content-Length': body.length,
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch (error) {
      finish(error.code === 'EACCES' || error.code === 'EPERM' ? 403 : 404, 'Not found');
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const value = process.env.PORT ?? '4173';
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error('PORT 必须是 0–65535 的整数。');
    process.exitCode = 1;
  } else {
    const server = await createStaticServer();
    server.on('error', error => {
      console.error(`无法启动本地预览：${error.message}`);
      process.exitCode = 1;
    });
    server.listen(port, '127.0.0.1', () => {
      console.log(`《换面》本地预览：http://127.0.0.1:${server.address().port}/`);
      console.log('按 Ctrl+C 停止。');
    });
  }
}
