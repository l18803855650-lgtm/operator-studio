const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const baseUrl = process.env.OPERATOR_BASE_URL || 'http://127.0.0.1:3010';
const tmpDir = path.join('/tmp', 'operator-studio-smoke');
const authCreds = { username: 'admin', password: 'operator123' };
const cookieJar = new Map();
const browserLogin = { username: 'smoke-user', password: 'browser-pass' };
const browserTotp = { secret: 'JBSWY3DPEHPK3PXP', issuer: 'Operator Studio Smoke', accountName: 'smoke-user', digits: 6, period: 30, algorithm: 'SHA1' };

function applySetCookie(setCookie) {
  if (!setCookie) return;
  const items = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const cookie of items) {
    const [pair] = String(cookie).split(';');
    const index = pair.indexOf('=');
    if (index === -1) continue;
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (!value) cookieJar.delete(key);
    else cookieJar.set(key, value);
  }
}

function cookieHeader() {
  return Array.from(cookieJar.entries()).map(([key, value]) => `${key}=${value}`).join('; ');
}

function request(method, routePath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(routePath, baseUrl);
    const payload = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request(
      url,
      {
        method,
        headers: {
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': String(payload.length) } : {}),
          ...(cookieJar.size > 0 ? { Cookie: cookieHeader() } : {}),
          ...headers,
        },
      },
      (res) => {
        applySetCookie(res.headers['set-cookie']);
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let json;
          try { json = raw ? JSON.parse(raw) : null; } catch { json = raw; }
          resolve({ status: res.statusCode || 0, data: json, headers: res.headers, raw });
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function requestBuffer(routePath, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(routePath, baseUrl);
    const req = http.request(
      url,
      {
        method: 'GET',
        headers: {
          ...(cookieJar.size > 0 ? { Cookie: cookieHeader() } : {}),
          ...headers,
        },
      },
      (res) => {
        applySetCookie(res.headers['set-cookie']);
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve({ status: res.statusCode || 0, buffer: Buffer.concat(chunks), headers: res.headers }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseCookies(header) {
  return Object.fromEntries(
    String(header || '')
      .split(';')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const index = item.indexOf('=');
        if (index === -1) return [item, ''];
        return [item.slice(0, index), item.slice(index + 1)];
      }),
  );
}

function parseForm(raw) {
  return Object.fromEntries(new URLSearchParams(String(raw || '')));
}

function decodeBase32Secret(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = String(value || '').toUpperCase().replace(/=+$/g, '').replace(/\s+/g, '');
  let bits = '';
  for (const char of clean) {
    const index = alphabet.indexOf(char);
    if (index === -1) throw new Error(`invalid base32 character: ${char}`);
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  return Buffer.from(bytes);
}

function generateTotpCode(config, offsetSteps = 0) {
  const digits = Number(config.digits || 6);
  const period = Number(config.period || 30);
  const algorithm = String(config.algorithm || 'SHA1').toLowerCase();
  const counter = Math.floor(Date.now() / 1000 / period) + offsetSteps;
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac(algorithm, decodeBase32Secret(config.secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);
  return String(code % (10 ** digits)).padStart(digits, '0');
}

async function ensureAuth() {
  const session = await request('GET', '/api/auth/session');
  const status = session.data?.data;
  if (!status) throw new Error(`auth session route failed: ${session.status} ${session.raw}`);
  if (status.requiresSetup) {
    const bootstrap = await request('POST', '/api/auth/bootstrap', authCreds);
    if (bootstrap.status !== 201) throw new Error(`bootstrap auth failed: ${bootstrap.status} ${JSON.stringify(bootstrap.data)}`);
    return;
  }
  if (!status.hasSession) {
    const login = await request('POST', '/api/auth/login', authCreds);
    if (login.status !== 200) throw new Error(`login auth failed: ${login.status} ${JSON.stringify(login.data)}`);
  }
}

async function startSupportServer(mediaFilePath) {
  const state = {
    webhookHits: [],
    webhookCalls: 0,
    visionHits: [],
    visionBatchHits: [],
    aiChatHits: [],
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const cookies = parseCookies(req.headers.cookie);

    if (req.method === 'GET' && url.pathname === '/login-mfa') {
      const html = `<!doctype html>
<html lang="zh-CN">
  <body>
    <h1 id="login-title">Smoke Login</h1>
    <form method="post" action="/login-mfa">
      <input id="username" name="username" value="" />
      <input id="password" name="password" type="password" value="" />
      <button id="login-submit" type="submit">下一步</button>
    </form>
  </body>
</html>`;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/login-mfa') {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        const form = parseForm(Buffer.concat(chunks).toString('utf8'));
        if (form.username !== browserLogin.username || form.password !== browserLogin.password) {
          res.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('invalid credentials');
          return;
        }
        res.writeHead(302, {
          Location: '/login-mfa/otp',
          'Set-Cookie': 'mfa_step=ready; Path=/; HttpOnly',
        });
        res.end();
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/login-mfa/otp') {
      if (cookies.mfa_step !== 'ready') {
        res.writeHead(302, { Location: '/login-mfa' });
        res.end();
        return;
      }
      const html = `<!doctype html>
<html lang="zh-CN">
  <body>
    <h1 id="otp-title">OTP Verify</h1>
    <form method="post" action="/login-mfa/otp">
      <input id="otp-code" name="otp" value="" inputmode="numeric" />
      <button id="otp-submit" type="submit">验证</button>
    </form>
  </body>
</html>`;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/login-mfa/otp') {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        const form = parseForm(Buffer.concat(chunks).toString('utf8'));
        const valid = [-1, 0, 1].some((offset) => generateTotpCode(browserTotp, offset) === String(form.otp || ''));
        if (cookies.mfa_step !== 'ready' || !valid) {
          res.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('invalid otp');
          return;
        }
        res.writeHead(302, {
          Location: '/browser-secure',
          'Set-Cookie': [
            'mfa_step=; Path=/; HttpOnly; Max-Age=0',
            'session_token=authenticated; Path=/; HttpOnly',
          ],
        });
        res.end();
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/browser-secure') {
      if (cookies.session_token !== 'authenticated') {
        res.writeHead(302, { Location: '/login-mfa' });
        res.end();
        return;
      }
      const html = `<!doctype html>
<html lang="zh-CN">
  <body>
    <h1 id="secure-title">Secure Dashboard</h1>
    <div id="secure-status">authenticated</div>
    <div id="secure-user">user:${browserLogin.username}</div>
    <a id="popup-link" target="_blank" href="/browser-popup">打开新页</a>
    <a id="download-link" href="/download/report.txt" download>下载报告</a>
  </body>
</html>`;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/browser-popup') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><html><body><h1 id="popup-title">Popup Ready</h1><div id="popup-state">popup-ok</div></body></html>');
      return;
    }

    if (req.method === 'GET' && url.pathname === '/download/report.txt') {
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': 'attachment; filename="report.txt"',
      });
      res.end('operator-studio browser download smoke');
      return;
    }

    if (req.method === 'GET' && url.pathname === '/control') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><html><body><div id="status">control-ready</div></body></html>');
      return;
    }

    if (req.method === 'GET' && url.pathname === '/media-source') {
      if (req.headers['x-media-auth'] !== 'media-secret' || cookies.media_token !== 'download-ok') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, reason: 'forbidden' }));
        return;
      }
      const bytes = fs.readFileSync(mediaFilePath);
      res.writeHead(200, { 'Content-Type': 'audio/wav' });
      res.end(bytes);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/webhook') {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        state.webhookCalls += 1;
        const raw = Buffer.concat(chunks).toString('utf8');
        let body = null;
        try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
        state.webhookHits.push({ attempt: state.webhookCalls, headers: req.headers, body, receivedAt: new Date().toISOString() });
        if (state.webhookCalls === 1) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, retry: true }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, received: Boolean(body), attempts: state.webhookCalls }));
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/vision') {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let body = null;
        try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
        state.visionHits.push(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          summary: '识别到 ESD 审计示意图与包装线边界框。',
          findings: [
            {
              title: '图片中存在需要人工复核的 ESD 区域标识',
              severity: 'P2',
              recommendation: '核对现场边界框与工位标识是否一致。',
              standardCode: '5S-HOUSEKEEPING',
            },
          ],
        }));
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/vision-batch') {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let body = null;
        try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
        state.visionBatchHits.push(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          summary: '多图比对显示两处工位都存在 ESD 边界标识，但测试记录与工位状态不一致，属于跨工位共性问题。',
          comparisons: [
            '图 A 与图 B 都出现蓝色边界框，说明两处都被识别为审计重点区域。',
            '其中一处更偏向人员测试记录缺失，另一处偏向工位边界与看板不一致。',
          ],
          findings: [
            {
              title: '跨图联合判断：边界标识与测试留痕存在共性缺口',
              severity: 'P1',
              recommendation: '将手环测试记录与工位边界看板纳入同一张班前点检表。',
              standardCode: 'ESD-GROUND',
              evidenceIds: ['E01', 'E02'],
            },
          ],
        }));
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let body = null;
        try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
        state.aiChatHits.push(body);
        const joinedText = JSON.stringify(body || {});
        const isBatch = joinedText.includes('多图联合理解');
        const responsePayload = isBatch
          ? {
              summary: 'AI 连接多图联合理解确认：两处工位都出现 ESD 标识与测试留痕不一致的问题。',
              comparisons: [
                '两张图都出现 ESD 边界区域，但测试留痕不足。',
                '一张图偏向工位标识缺口，另一张图偏向测试记录缺口。',
              ],
              findings: [
                {
                  title: '跨图联合判断：测试留痕与工位标识存在共性缺口',
                  severity: 'P1',
                  recommendation: '将工位标识核对与手环测试记录纳入同一张班前点检表。',
                  standardCode: 'ESD-GROUND',
                  evidenceIds: ['E01', 'E02'],
                },
              ],
            }
          : {
              summary: 'AI 连接识别到 ESD 审计图像，提示需要复核工位标识与测试留痕。',
              findings: [
                {
                  title: 'AI 连接识别：工位标识需要人工复核',
                  severity: 'P2',
                  recommendation: '复核工位边界框、看板与手环测试记录是否一致。',
                  standardCode: '5S-HOUSEKEEPING',
                  observation: '图像中存在明显的审计框和工位标识。',
                },
              ],
            };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          id: 'chatcmpl-smoke',
          object: 'chat.completion',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: JSON.stringify(responsePayload),
              },
            },
          ],
        }));
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('not found');
  });

  await new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', (error) => {
      if (error) reject(error);
      else resolve(null);
    });
  });

  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('failed to start support server');
  return { server, state, baseUrl: `http://127.0.0.1:${address.port}` };
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve(null);
    });
  });
}

function ensureSmokeMedia() {
  fs.mkdirSync(tmpDir, { recursive: true });
  const mediaPath = path.join(tmpDir, 'operator-media-smoke.wav');
  if (!fs.existsSync(mediaPath)) {
    const result = spawnSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'sine=frequency=880:duration=1', mediaPath], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`ffmpeg failed to generate smoke media: ${result.stderr || result.stdout}`);
  }
  return mediaPath;
}

function ensureFactoryEvidence() {
  const evidenceDir = path.join(tmpDir, 'factory-evidence');
  const exportDir = path.join(tmpDir, 'factory-export');
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.mkdirSync(exportDir, { recursive: true });

  const notePath = path.join(evidenceDir, 'audit-note.md');
  const checklistPath = path.join(evidenceDir, 'checklist.txt');
  const stationJsonPath = path.join(evidenceDir, 'station-observation.json');
  const imageAPath = path.join(evidenceDir, 'station-a.png');
  const imageBPath = path.join(evidenceDir, 'station-b.png');

  fs.writeFileSync(notePath, '# Smoke factory audit\n\n- 工位：ESD 包装线\n- 问题：手环测试未留痕\n', 'utf8');
  fs.writeFileSync(checklistPath, '1. 手环测试\n2. 工位标识\n3. 设备点检\n', 'utf8');
  fs.writeFileSync(stationJsonPath, JSON.stringify({ station: 'Line-1', issue: 'wristband verification missing', severity: 'P1' }, null, 2), 'utf8');

  const imageResult = spawnSync('python3', ['-c', [
    'from PIL import Image, ImageDraw',
    'import sys',
    'for idx, output in enumerate(sys.argv[1:], start=1):',
    '    img = Image.new("RGB", (480, 320), (245, 248, 250))',
    '    draw = ImageDraw.Draw(img)',
    '    color = (30, 64, 175) if idx == 1 else (194, 65, 12)',
    '    draw.rectangle((40, 60, 440, 260), outline=color, width=6)',
    '    draw.text((70, 140), f"ESD Audit Smoke {idx}", fill=(15, 23, 42))',
    '    img.save(output)',
  ].join('\n'), imageAPath, imageBPath], { encoding: 'utf8' });
  if (imageResult.status !== 0) throw new Error(`failed to generate factory evidence images: ${imageResult.stderr || imageResult.stdout}`);

  return { evidenceDir, exportDir, imagePaths: [imageAPath, imageBPath] };
}

async function waitForRunStatus(runId, statuses, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  let snapshot = null;
  while (Date.now() < deadline) {
    const current = await request('GET', `/api/runs/${runId}`);
    snapshot = current.data.data;
    if (snapshot && statuses.includes(snapshot.status)) return snapshot;
    await sleep(1200);
  }
  return snapshot;
}

async function waitForRun(runId, timeoutMs = 60000) {
  return waitForRunStatus(runId, ['completed', 'attention', 'stopped'], timeoutMs);
}

async function getArtifacts(runId) {
  const artifacts = await request('GET', `/api/runs/${runId}/artifacts`);
  return artifacts.data?.data ?? [];
}

async function getEvents(runId) {
  const events = await request('GET', `/api/runs/${runId}/events`);
  return events.data?.data ?? [];
}

async function main() {
  const mediaFilePath = ensureSmokeMedia();
  const factory = ensureFactoryEvidence();
  const support = await startSupportServer(mediaFilePath);
  try {
    const health = await request('GET', '/api/health');
    if (health.status !== 200) throw new Error(`health failed: ${health.status}`);
    const ready = await request('GET', '/api/ready');
    if (ready.status !== 200) throw new Error(`ready failed: ${ready.status}`);

    await ensureAuth();

    const profileStorageStatePath = path.join(tmpDir, 'browser-profile-state.json');
    if (fs.existsSync(profileStorageStatePath)) fs.unlinkSync(profileStorageStatePath);

    const profileCreate = await request('POST', '/api/browser-profiles', {
      name: 'Smoke MFA Profile',
      description: '复杂登录 + TOTP + storage state 回写 smoke profile',
      storageStatePath: profileStorageStatePath,
      secrets: {
        username: browserLogin.username,
        password: browserLogin.password,
      },
      totp: browserTotp,
      locale: 'zh-CN',
    });
    if (profileCreate.status !== 201) throw new Error(`create browser profile failed: ${profileCreate.status} ${JSON.stringify(profileCreate.data)}`);
    const browserProfile = profileCreate.data.data;

    const mediaDeliveryDir = path.join(tmpDir, 'media-delivery');
    const factoryAiExportDir = path.join(tmpDir, 'factory-export-ai');
    fs.mkdirSync(mediaDeliveryDir, { recursive: true });
    fs.mkdirSync(factoryAiExportDir, { recursive: true });

    const aiConnectionCreate = await request('POST', '/api/ai-connections', {
      name: 'Smoke Direct Vision',
      baseUrl: `${support.baseUrl}/v1`,
      apiKey: 'smoke-direct-api-key',
      model: 'gpt-4.1-mini',
      notes: '用于 smoke 验证 direct AI connection vision',
    });
    if (aiConnectionCreate.status !== 201) throw new Error(`create ai connection failed: ${aiConnectionCreate.status} ${JSON.stringify(aiConnectionCreate.data)}`);
    const aiConnection = aiConnectionCreate.data.data;

    const governanceUpdate = await request('PATCH', '/api/governance', { defaultAiConnectionId: aiConnection.id });
    if (governanceUpdate.status !== 200) throw new Error(`update governance default ai connection failed: ${governanceUpdate.status} ${JSON.stringify(governanceUpdate.data)}`);

    const browserCreate = await request('POST', '/api/runs', {
      templateId: 'browser-operator',
      target: 'Smoke browser login+mfa run',
      lifecycle: 'temporary',
      executionInput: JSON.stringify({
        credentialProfileId: browserProfile.id,
        url: `${support.baseUrl}/login-mfa`,
        waitUntil: 'networkidle',
        timeoutMs: 30000,
        captureHtml: true,
        captureScreenshot: true,
        saveStorageState: true,
        persistProfileStorageState: true,
        actions: [
          { type: 'assertExists', selector: '#login-title', label: '登录页存在' },
          { type: 'fillSecret', selector: '#username', key: 'username', label: '填用户名' },
          { type: 'fillSecret', selector: '#password', key: 'password', label: '填密码' },
          { type: 'click', selector: '#login-submit', label: '提交首步登录' },
          { type: 'waitForUrl', expected: '/login-mfa/otp', label: '等待 OTP 页' },
          { type: 'waitForLoadState', state: 'networkidle', label: '等待 OTP 页稳定' },
          { type: 'fillTotp', selector: '#otp-code', label: '填写 TOTP' },
          { type: 'click', selector: '#otp-submit', label: '提交 OTP' },
          { type: 'waitForUrl', expected: '/browser-secure', label: '等待进入后台' },
          { type: 'assertText', selector: '#secure-status', expected: 'authenticated', mode: 'equals', label: '登录成功断言' },
          { type: 'clickNewPage', selector: '#popup-link', newPageAlias: 'popup', label: '打开新页' },
          { type: 'assertText', page: 'popup', selector: '#popup-title', expected: 'Popup Ready', mode: 'equals', label: 'Popup 标题断言' },
          { type: 'switchPage', to: 'main', label: '切回主页' },
          { type: 'download', selector: '#download-link', fileName: 'report.txt', label: '下载报告' },
          { type: 'saveStorageState', label: '导出 run 会话' },
          { type: 'screenshot', label: '执行后截图', fullPage: true }
        ],
      }),
    });
    if (browserCreate.status !== 201) throw new Error(`create browser run failed: ${browserCreate.status} ${JSON.stringify(browserCreate.data)}`);
    const browserRun = browserCreate.data.data;

    const mediaCreate = await request('POST', '/api/runs', {
      templateId: 'media-agent',
      target: `${support.baseUrl}/media-source`,
      lifecycle: 'temporary',
      executionInput: JSON.stringify({
        source: `${support.baseUrl}/media-source`,
        archiveName: 'operator-media-smoke.wav',
        extractFrame: true,
        sourceHeaders: { 'x-media-auth': 'media-secret' },
        sourceCookies: [{ name: 'media_token', value: 'download-ok' }],
        sourceUserAgent: 'operator-studio-smoke',
        sourceRetries: 1,
        sourceBackoffMs: 300,
        deliveryDir: mediaDeliveryDir,
        deliveryWebhookUrl: `${support.baseUrl}/webhook`,
        deliveryWebhookHeaders: { 'x-smoke-webhook': 'operator-studio' },
        deliveryWebhookRetries: 2,
        deliveryWebhookBackoffMs: 300,
        emitChecksums: true,
      }),
    });
    if (mediaCreate.status !== 201) throw new Error(`create media run failed: ${mediaCreate.status} ${JSON.stringify(mediaCreate.data)}`);
    const mediaRun = mediaCreate.data.data;

    const factoryCreate = await request('POST', '/api/runs', {
      templateId: 'factory-audit',
      target: 'Smoke factory audit',
      lifecycle: 'temporary',
      executionInput: JSON.stringify({
        site: 'Smoke ESD line',
        lineName: 'Line-1',
        auditTitle: 'Smoke factory audit',
        owner: 'QA',
        evidenceDir: factory.evidenceDir,
        checklist: ['人员进入工位前完成手环测试', '工位标识清晰'],
        findings: [
          {
            title: '人员进入工位前未确认手环测试记录',
            severity: 'P1',
            standardCode: 'ESD-GROUND',
            recommendation: '上线前强制做手环测试并保留签核记录。',
          },
        ],
        exportDir: factory.exportDir,
        exportPptx: true,
        presentationTitle: 'Smoke Factory Deck',
        visionWebhookUrl: `${support.baseUrl}/vision`,
        visionWebhookHeaders: { 'x-vision-source': 'operator-studio' },
        visionBatchWebhookUrl: `${support.baseUrl}/vision-batch`,
        visionBatchWebhookHeaders: { 'x-vision-batch': 'operator-studio' },
      }),
    });
    if (factoryCreate.status !== 201) throw new Error(`create factory run failed: ${factoryCreate.status} ${JSON.stringify(factoryCreate.data)}`);
    const factoryRun = factoryCreate.data.data;

    const factoryAiCreate = await request('POST', '/api/runs', {
      templateId: 'factory-audit',
      target: 'Smoke factory audit via ai connection',
      lifecycle: 'temporary',
      executionInput: JSON.stringify({
        site: 'Smoke ESD line',
        lineName: 'Line-2',
        auditTitle: 'Smoke factory audit via ai connection',
        owner: 'QA',
        evidenceDir: factory.evidenceDir,
        checklist: ['两处工位都需要检查手环测试留痕', '两处工位都需要核对边界标识'],
        exportDir: factoryAiExportDir,
        exportPptx: true,
        presentationTitle: 'Smoke Factory Deck AI Connection',
      }),
    });
    if (factoryAiCreate.status !== 201) throw new Error(`create direct factory run failed: ${factoryAiCreate.status} ${JSON.stringify(factoryAiCreate.data)}`);
    const factoryAiRun = factoryAiCreate.data.data;

    const controlCreate = await request('POST', '/api/runs', {
      templateId: 'browser-operator',
      target: 'Smoke control run',
      lifecycle: 'temporary',
      executionInput: JSON.stringify({
        url: `${support.baseUrl}/control`,
        waitUntil: 'networkidle',
        timeoutMs: 30000,
        actions: [
          { type: 'wait', ms: 4000, label: '模拟长动作' },
          { type: 'assertText', selector: '#status', expected: 'control-ready', label: '恢复后断言' },
        ],
      }),
    });
    if (controlCreate.status !== 201) throw new Error(`create control run failed: ${controlCreate.status} ${JSON.stringify(controlCreate.data)}`);
    const controlRun = controlCreate.data.data;

    const controlReadyToStop = await waitForRunStatus(controlRun.id, ['queued', 'running'], 20000);
    if (!controlReadyToStop || !['queued', 'running'].includes(controlReadyToStop.status)) {
      throw new Error(`control run was not ready to stop: ${JSON.stringify(controlReadyToStop)}`);
    }

    const stoppedControl = await request('PATCH', `/api/runs/${controlRun.id}`, { desiredState: 'stopped' });
    if (stoppedControl.status !== 200) throw new Error(`stop control run failed: ${stoppedControl.status} ${JSON.stringify(stoppedControl.data)}`);
    const controlStopped = await waitForRunStatus(controlRun.id, ['stopped'], 15000);
    if (controlStopped?.status !== 'stopped') throw new Error(`control run did not stop: ${JSON.stringify(controlStopped)}`);

    const resumedControl = await request('PATCH', `/api/runs/${controlRun.id}`, { desiredState: 'active' });
    if (resumedControl.status !== 200) throw new Error(`resume control run failed: ${resumedControl.status} ${JSON.stringify(resumedControl.data)}`);

    const [browserSnapshot, mediaSnapshot, factorySnapshot, factoryAiSnapshot, controlSnapshot] = await Promise.all([
      waitForRun(browserRun.id, 90000),
      waitForRun(mediaRun.id, 90000),
      waitForRun(factoryRun.id, 90000),
      waitForRun(factoryAiRun.id, 90000),
      waitForRun(controlRun.id, 90000),
    ]);

    const [browserArtifacts, mediaArtifacts, factoryArtifacts, factoryAiArtifacts, controlArtifacts, controlEvents] = await Promise.all([
      getArtifacts(browserRun.id),
      getArtifacts(mediaRun.id),
      getArtifacts(factoryRun.id),
      getArtifacts(factoryAiRun.id),
      getArtifacts(controlRun.id),
      getEvents(controlRun.id),
    ]);

    const browserActionArtifact = browserArtifacts.find((item) => item.label === 'Browser action log');
    const factoryIndexArtifact = factoryArtifacts.find((item) => item.label === 'Factory evidence index');
    const factoryAiIndexArtifact = factoryAiArtifacts.find((item) => item.label === 'Factory evidence index');
    const browserActionDownload = browserActionArtifact ? await requestBuffer(`/api/runs/${browserRun.id}/artifacts/${browserActionArtifact.id}`) : null;
    const factoryIndexDownload = factoryIndexArtifact ? await requestBuffer(`/api/runs/${factoryRun.id}/artifacts/${factoryIndexArtifact.id}`) : null;
    const factoryAiIndexDownload = factoryAiIndexArtifact ? await requestBuffer(`/api/runs/${factoryAiRun.id}/artifacts/${factoryAiIndexArtifact.id}`) : null;
    const browserActionLog = browserActionDownload ? JSON.parse(browserActionDownload.buffer.toString('utf8')) : null;
    const factoryEvidenceIndex = factoryIndexDownload ? JSON.parse(factoryIndexDownload.buffer.toString('utf8')) : null;
    const factoryAiEvidenceIndex = factoryAiIndexDownload ? JSON.parse(factoryAiIndexDownload.buffer.toString('utf8')) : null;
    const profileStorageState = fs.existsSync(profileStorageStatePath)
      ? JSON.parse(fs.readFileSync(profileStorageStatePath, 'utf8'))
      : null;

    const result = {
      browser: {
        runId: browserRun.id,
        status: browserSnapshot?.status,
        artifacts: browserArtifacts.length,
        artifactLabels: browserArtifacts.slice(0, 12).map((item) => item.label),
        profileStorageStateSaved: fs.existsSync(profileStorageStatePath),
      },
      media: {
        runId: mediaRun.id,
        status: mediaSnapshot?.status,
        artifacts: mediaArtifacts.length,
        artifactLabels: mediaArtifacts.slice(0, 12).map((item) => item.label),
        webhookCalls: support.state.webhookCalls,
      },
      factory: {
        runId: factoryRun.id,
        status: factorySnapshot?.status,
        artifacts: factoryArtifacts.length,
        artifactLabels: factoryArtifacts.slice(0, 12).map((item) => item.label),
        visionHits: support.state.visionHits.length,
        visionBatchHits: support.state.visionBatchHits.length,
      },
      factoryDirectAi: {
        runId: factoryAiRun.id,
        status: factoryAiSnapshot?.status,
        artifacts: factoryAiArtifacts.length,
        artifactLabels: factoryAiArtifacts.slice(0, 12).map((item) => item.label),
        aiChatHits: support.state.aiChatHits.length,
      },
      control: {
        runId: controlRun.id,
        status: controlSnapshot?.status,
        artifacts: controlArtifacts.length,
        stoppedObserved: controlStopped?.status === 'stopped',
        eventTypes: controlEvents.slice(0, 12).map((item) => item.eventType),
      },
    };

    if (browserSnapshot?.status !== 'completed') throw new Error(`browser smoke did not complete: ${JSON.stringify(result.browser)}`);
    if (mediaSnapshot?.status !== 'completed') throw new Error(`media smoke did not complete: ${JSON.stringify(result.media)}`);
    if (factorySnapshot?.status !== 'completed') throw new Error(`factory smoke did not complete: ${JSON.stringify(result.factory)}`);
    if (factoryAiSnapshot?.status !== 'completed') throw new Error(`factory direct ai smoke did not complete: ${JSON.stringify(result.factoryDirectAi)}`);
    if (controlSnapshot?.status !== 'completed') throw new Error(`control smoke did not complete after resume: ${JSON.stringify(result.control)}`);

    if (!browserArtifacts.some((item) => item.kind === 'replay')) throw new Error(`browser smoke missing replay artifact: ${JSON.stringify(result.browser)}`);
    if (!browserArtifacts.some((item) => item.label === 'Browser action log')) throw new Error(`browser smoke missing action log artifact: ${JSON.stringify(result.browser)}`);
    if (!browserArtifacts.some((item) => item.label === 'Browser storage state')) throw new Error(`browser smoke missing storage state artifact: ${JSON.stringify(result.browser)}`);
    if (!browserArtifacts.some((item) => item.label === 'Browser persisted profile state')) throw new Error(`browser smoke missing persisted profile state artifact: ${JSON.stringify(result.browser)}`);
    if (!browserArtifacts.some((item) => item.label.startsWith('浏览器下载：'))) throw new Error(`browser smoke missing download artifact: ${JSON.stringify(result.browser)}`);
    if (!browserActionLog?.openPages?.some((item) => item.alias === 'popup')) throw new Error(`browser smoke missing popup page in action log: ${JSON.stringify(browserActionLog)}`);
    if (!browserActionLog?.results?.some((item) => item.type === 'fillsecret' && item.valuePreview === '[secret:username]')) throw new Error(`browser smoke missing fillSecret trace: ${JSON.stringify(browserActionLog)}`);
    if (!browserActionLog?.results?.some((item) => item.type === 'filltotp' && item.valuePreview === '[totp]')) throw new Error(`browser smoke missing fillTotp trace: ${JSON.stringify(browserActionLog)}`);
    if (!result.browser.profileStorageStateSaved) throw new Error(`browser smoke did not save profile storage state: ${profileStorageStatePath}`);
    if (!profileStorageState?.cookies?.some((item) => item.name === 'session_token')) throw new Error(`browser smoke profile storage state missing session cookie: ${JSON.stringify(profileStorageState)}`);

    if (!mediaArtifacts.some((item) => item.kind === 'replay')) throw new Error(`media smoke missing replay artifact: ${JSON.stringify(result.media)}`);
    if (!mediaArtifacts.some((item) => item.label === 'Media delivery manifest')) throw new Error(`media smoke missing delivery manifest artifact: ${JSON.stringify(result.media)}`);
    if (!mediaArtifacts.some((item) => item.label === 'Media webhook receipt')) throw new Error(`media smoke missing webhook receipt artifact: ${JSON.stringify(result.media)}`);
    if (support.state.webhookCalls < 2) throw new Error(`media smoke did not exercise webhook retry: ${JSON.stringify(result.media)}`);
    const lastWebhookHit = support.state.webhookHits[support.state.webhookHits.length - 1];
    if (lastWebhookHit?.headers['x-smoke-webhook'] !== 'operator-studio') throw new Error(`media smoke webhook header missing: ${JSON.stringify(lastWebhookHit)}`);
    if (lastWebhookHit?.body?.runId !== mediaRun.id) throw new Error(`media smoke webhook payload mismatch: ${JSON.stringify(lastWebhookHit?.body)}`);
    if (!lastWebhookHit?.body?.archivedSource?.sha256) throw new Error(`media smoke webhook payload missing checksum: ${JSON.stringify(lastWebhookHit?.body)}`);

    if (!factoryArtifacts.some((item) => item.kind === 'replay')) throw new Error(`factory smoke missing replay artifact: ${JSON.stringify(result.factory)}`);
    if (!factoryArtifacts.some((item) => item.label === 'Factory report html')) throw new Error(`factory smoke missing report html artifact: ${JSON.stringify(result.factory)}`);
    if (!factoryArtifacts.some((item) => item.label === 'Factory report pptx')) throw new Error(`factory smoke missing report pptx artifact: ${JSON.stringify(result.factory)}`);
    if (!fs.readdirSync(factory.exportDir).some((fileName) => fileName.endsWith('.pptx'))) throw new Error(`factory smoke export dir missing pptx: ${factory.exportDir}`);
    if (support.state.visionHits.length === 0) throw new Error(`factory smoke vision webhook not called: ${JSON.stringify(result.factory)}`);
    if (support.state.visionBatchHits.length === 0) throw new Error(`factory smoke vision batch webhook not called: ${JSON.stringify(result.factory)}`);
    if (!factoryEvidenceIndex?.visionBatch?.summary) throw new Error(`factory smoke missing vision batch summary: ${JSON.stringify(factoryEvidenceIndex)}`);
    if (!factoryEvidenceIndex?.findings?.some((item) => String(item.title || '').includes('跨图联合判断'))) {
      throw new Error(`factory smoke missing auto findings from vision batch: ${JSON.stringify(factoryEvidenceIndex)}`);
    }

    if (!factoryAiArtifacts.some((item) => item.kind === 'replay')) throw new Error(`factory direct ai smoke missing replay artifact: ${JSON.stringify(result.factoryDirectAi)}`);
    if (!factoryAiArtifacts.some((item) => item.label === 'Factory report pptx')) throw new Error(`factory direct ai smoke missing report pptx: ${JSON.stringify(result.factoryDirectAi)}`);
    if (!fs.readdirSync(factoryAiExportDir).some((fileName) => fileName.endsWith('.pptx'))) throw new Error(`factory direct ai export dir missing pptx: ${factoryAiExportDir}`);
    if (support.state.aiChatHits.length === 0) throw new Error(`factory direct ai smoke did not hit openai-compatible endpoint: ${JSON.stringify(result.factoryDirectAi)}`);
    if (!factoryAiEvidenceIndex?.visionBatch?.summary) throw new Error(`factory direct ai smoke missing vision batch summary: ${JSON.stringify(factoryAiEvidenceIndex)}`);
    if (!factoryAiEvidenceIndex?.findings?.some((item) => String(item.title || '').includes('跨图联合判断'))) {
      throw new Error(`factory direct ai smoke missing auto findings from ai connection: ${JSON.stringify(factoryAiEvidenceIndex)}`);
    }

    if (!controlArtifacts.some((item) => item.kind === 'replay')) throw new Error(`control smoke missing replay artifact: ${JSON.stringify(result.control)}`);
    if (controlStopped?.status !== 'stopped') throw new Error(`control smoke did not observe stopped state: ${JSON.stringify(result.control)}`);
    if (!controlEvents.some((item) => item.eventType === 'run_reactivated')) throw new Error(`control smoke missing run_reactivated event: ${JSON.stringify(result.control)}`);

    console.log(JSON.stringify(result, null, 2));
  } finally {
    await closeServer(support.server);
  }
}

main().catch((error) => {
  console.error('[operator-studio smoke] failed', error);
  process.exitCode = 1;
});
