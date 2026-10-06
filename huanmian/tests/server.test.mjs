import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, writeFile, symlink, rm, rmdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStaticServer } from '../tools/serve.mjs';

function request(server, target, method = 'GET') {
  return new Promise(resolve => {
    const headers = {};
    const response = {
      status: 200,
      setHeader(name, value) { headers[name.toLowerCase()] = value; },
      writeHead(status, values = {}) {
        this.status = status;
        for (const [name, value] of Object.entries(values)) headers[name.toLowerCase()] = value;
      },
      end(body) { resolve({ status: this.status, headers, body: body?.toString() || '' }); },
    };
    // Exercise the real HTTP handler without needing permission to open a loopback client.
    server.emit('request', { url: target, method }, response);
  });
}

test('静态预览支持模块和 HEAD，拒绝原始、编码及 Windows 分隔符目录逃逸', async t => {
  const scratch = fileURLToPath(new URL('../.test-work/', import.meta.url));
  await mkdir(scratch, { recursive: true });
  const base = await mkdtemp(path.join(scratch, 'server-'));
  let server;
  t.after(async () => {
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    await rm(base, { recursive: true, force: true });
    await rmdir(scratch).catch(error => { if (!['ENOTEMPTY', 'ENOENT'].includes(error.code)) throw error; });
  });
  const root = path.join(base, 'public');
  const outside = path.join(base, 'outside');
  await mkdir(root);
  await mkdir(outside);
  await writeFile(path.join(root, 'index.html'), '<h1>换面</h1>');
  await writeFile(path.join(root, 'app.js'), 'export const ready = true;');
  await writeFile(path.join(base, 'secret.txt'), 'private');
  await writeFile(path.join(outside, 'index.html'), 'private');
  server = await createStaticServer({ root });
  const page = await request(server, '/?preview=1');
  assert.equal(page.status, 200);
  assert.equal(page.body, '<h1>换面</h1>');
  assert.match((await request(server, '/app.js')).headers['content-type'], /javascript/);
  const head = await request(server, '/', 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
  assert.ok(Number(head.headers['content-length']) > 0);
  for (const target of ['/../secret.txt', '/%2e%2e/secret.txt', '/%2e%2e%5csecret.txt', '/.git/config']) {
    const result = await request(server, target);
    assert.equal(result.status, 403, target);
    assert.ok(!result.body.includes('private'));
  }
  assert.equal((await request(server, '/%ZZ')).status, 400);
  assert.equal((await request(server, '/', 'POST')).status, 405);
  assert.equal((await request(server, '/missing')).status, 404);
  try {
    await symlink(outside, path.join(root, 'escape'), 'junction');
    assert.equal((await request(server, '/escape/')).status, 403, 'junction outside root');
  } catch (error) {
    if (!['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) throw error;
    t.diagnostic('当前环境不能创建符号链接；其余路径逃逸验证已执行。');
  }
});

test('本地静态预览通过真实回环 HTTP 提供 HTML、模块和 HEAD 响应', { timeout: 10000 }, async t => {
  const server = await createStaticServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const port = server.address().port;
  const liveRequest = (target, method = 'GET') => new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: target, method }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.end();
  });
  let page;
  try { page = await liveRequest('/'); }
  catch (error) {
    if (error.code !== 'EACCES' && error.code !== 'EPERM') throw error;
    t.skip('当前环境禁止回环客户端；请求处理器测试仍完整执行。');
    return;
  }
  assert.equal(page.status, 200);
  assert.match(page.body, /换面/);
  const module = await liveRequest('/engine.js');
  assert.equal(module.status, 200);
  assert.match(module.headers['content-type'], /javascript/);
  const head = await liveRequest('/', 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
  assert.ok(Number(head.headers['content-length']) > 0);
  assert.equal((await liveRequest('/%2e%2e/package.json')).status, 403);
});
