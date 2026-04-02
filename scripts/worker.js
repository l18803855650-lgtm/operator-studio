const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { spawnSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const projectRoot = process.cwd();
const dataDir = path.resolve(projectRoot, process.env.OPERATOR_DATA_DIR || './data');
const dbPath = path.resolve(projectRoot, process.env.OPERATOR_DB_PATH || path.join(dataDir, 'operator-studio.sqlite'));
const workerName = 'main-worker';
const chromiumPath = process.env.OPERATOR_CHROMIUM_PATH || '/usr/bin/chromium-browser';
const playwrightCorePath = process.env.PLAYWRIGHT_CORE_PATH || '/root/.local/share/pnpm/global/5/.pnpm/playwright-core@1.58.2/node_modules/playwright-core';

function nowIso() { return new Date().toISOString(); }
function log(message, meta = {}) { console.log(JSON.stringify({ scope: 'operator-studio-worker', message, ...meta })); }
function row(obj) { return obj || null; }
function safeJsonParse(value, fallback = null) { try { return value ? JSON.parse(value) : fallback; } catch { return fallback; } }
function sanitizeName(value) { return String(value || 'artifact').replace(/[^a-zA-Z0-9._-]+/g, '-'); }
function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }
function fileExists(filePath) { try { fs.accessSync(filePath); return true; } catch { return false; } }
function isUrl(value) { return /^https?:\/\//i.test(String(value || '')); }

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

function getColumns(table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((item) => String(item.name || ''));
}

function ensureColumn(table, column, definition) {
  if (!getColumns(table).includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function bootstrapSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS governance_settings (
      setting_key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS worker_heartbeats (
      worker_name TEXT PRIMARY KEY,
      heartbeat_at TEXT NOT NULL,
      status TEXT NOT NULL,
      meta_json TEXT
    );
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      trace_id TEXT,
      template_id TEXT,
      template_name TEXT,
      title TEXT,
      goal TEXT,
      target TEXT,
      created_at TEXT,
      lifecycle TEXT,
      desired_state TEXT,
      labels_json TEXT,
      operator_notes_json TEXT,
      default_model TEXT,
      fallback_model TEXT,
      verification TEXT
    );
    CREATE TABLE IF NOT EXISTS run_steps (
      run_id TEXT NOT NULL,
      step_index INTEGER NOT NULL,
      step_id TEXT,
      title TEXT,
      description TEXT,
      duration_sec INTEGER,
      tool_hint TEXT,
      evidence_hint TEXT,
      PRIMARY KEY (run_id, step_index)
    );
    CREATE TABLE IF NOT EXISTS run_events (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      level TEXT NOT NULL,
      event_type TEXT NOT NULL,
      message TEXT NOT NULL,
      payload_json TEXT
    );
    CREATE TABLE IF NOT EXISTS run_artifacts (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      kind TEXT NOT NULL,
      label TEXT NOT NULL,
      file_path TEXT NOT NULL,
      content_type TEXT,
      metadata_json TEXT
    );
    CREATE TABLE IF NOT EXISTS browser_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      storage_state_path TEXT,
      headers_json TEXT,
      cookies_json TEXT,
      basic_auth_json TEXT,
      locale TEXT,
      user_agent TEXT,
      secrets_json TEXT,
      totp_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  ensureColumn('runs', 'status', 'TEXT');
  ensureColumn('runs', 'progress_percent', 'INTEGER');
  ensureColumn('runs', 'started_at', 'TEXT');
  ensureColumn('runs', 'updated_at', 'TEXT');
  ensureColumn('runs', 'completed_at', 'TEXT');
  ensureColumn('runs', 'current_step_index', 'INTEGER');
  ensureColumn('runs', 'live_summary', 'TEXT');
  ensureColumn('runs', 'executor_type', 'TEXT');
  ensureColumn('runs', 'execution_mode', 'TEXT');
  ensureColumn('runs', 'execution_input_json', 'TEXT');
  ensureColumn('runs', 'execution_summary_json', 'TEXT');

  ensureColumn('run_steps', 'status', 'TEXT');
  ensureColumn('run_steps', 'started_at', 'TEXT');
  ensureColumn('run_steps', 'finished_at', 'TEXT');

  ensureColumn('browser_profiles', 'secrets_json', 'TEXT');
  ensureColumn('browser_profiles', 'totp_json', 'TEXT');

  db.exec(`
    UPDATE runs
    SET status = COALESCE(NULLIF(status, ''), CASE WHEN desired_state = 'stopped' THEN 'stopped' ELSE 'queued' END),
        progress_percent = COALESCE(progress_percent, 0),
        updated_at = COALESCE(updated_at, created_at),
        live_summary = COALESCE(NULLIF(live_summary, ''), 'Queued for worker'),
        executor_type = COALESCE(NULLIF(executor_type, ''), CASE
          WHEN template_id LIKE 'browser%' THEN 'browser-playwright'
          WHEN template_id LIKE 'media%' THEN 'media-pipeline'
          WHEN template_id LIKE 'factory%' THEN 'factory-audit-pipeline'
          ELSE 'simulated-template'
        END),
        execution_mode = COALESCE(NULLIF(execution_mode, ''), CASE
          WHEN template_id LIKE 'browser%' THEN 'real'
          WHEN template_id LIKE 'media%' THEN 'real'
          WHEN template_id LIKE 'factory%' THEN 'real'
          ELSE 'simulated'
        END);

    UPDATE run_steps
    SET status = COALESCE(NULLIF(status, ''), 'pending');
  `);

  if (!db.prepare('SELECT value_json FROM governance_settings WHERE setting_key = ?').get('global')) {
    db.prepare('INSERT INTO governance_settings(setting_key, value_json, updated_at) VALUES (?, ?, ?)').run(
      'global',
      JSON.stringify({
        defaultLifecycle: 'persistent',
        workerPollIntervalMs: 1200,
        maxConcurrentRuns: 3,
        dailyRunBudget: 50,
        artifactRetentionDays: 14,
        persistentRequiresConfirmation: true,
        visualVerificationRequired: true,
        browserDefaultModel: 'openai-codex/gpt-5.4',
        mediaDefaultModel: 'minimax/MiniMax-M2.7-highspeed',
        factoryDefaultModel: 'openai-codex/gpt-5.4',
      }),
      nowIso(),
    );
  }
}

bootstrapSchema();

function getGovernance() {
  const row = db.prepare('SELECT value_json FROM governance_settings WHERE setting_key = ?').get('global');
  const defaults = {
    workerPollIntervalMs: 1200,
    maxConcurrentRuns: 3,
    visualVerificationRequired: true,
  };
  if (!row || !row.value_json) return defaults;
  try {
    return { ...defaults, ...JSON.parse(row.value_json) };
  } catch {
    return defaults;
  }
}

function heartbeat() {
  const payload = {
    pid: process.pid,
    host: os.hostname(),
    pollMs: getGovernance().workerPollIntervalMs,
    chromiumPath,
    playwrightCorePath,
  };
  db.prepare(`
    INSERT INTO worker_heartbeats(worker_name, heartbeat_at, status, meta_json)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(worker_name) DO UPDATE SET heartbeat_at=excluded.heartbeat_at, status=excluded.status, meta_json=excluded.meta_json
  `).run(workerName, nowIso(), 'running', JSON.stringify(payload));
}

function listActiveRuns() {
  return db.prepare(`SELECT * FROM runs WHERE desired_state = 'active' AND status IN ('queued','running') ORDER BY created_at ASC`).all();
}

function listSteps(runId) {
  return db.prepare('SELECT * FROM run_steps WHERE run_id = ? ORDER BY step_index ASC').all(runId);
}

function insertEvent(runId, level, eventType, message, payload = null) {
  db.prepare(`
    INSERT INTO run_events(id, run_id, created_at, level, event_type, message, payload_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(crypto.randomUUID(), runId, nowIso(), level, eventType, message, payload ? JSON.stringify(payload) : null);
}

function insertArtifact(runId, kind, label, filePath, contentType = 'text/plain', metadata = null) {
  db.prepare(`
    INSERT INTO run_artifacts(id, run_id, created_at, kind, label, file_path, content_type, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(crypto.randomUUID(), runId, nowIso(), kind, label, filePath, contentType, metadata ? JSON.stringify(metadata) : null);
}

function updateRunStatus(runId, patch) {
  const current = db.prepare('SELECT * FROM runs WHERE id = ?').get(runId);
  if (!current) return;
  const next = { ...current, ...patch };
  db.prepare(`
    UPDATE runs
    SET status = ?, progress_percent = ?, started_at = ?, updated_at = ?, completed_at = ?, current_step_index = ?, live_summary = ?, desired_state = ?, execution_summary_json = ?
    WHERE id = ?
  `).run(
    next.status,
    next.progress_percent,
    next.started_at || null,
    next.updated_at,
    next.completed_at || null,
    next.current_step_index ?? null,
    next.live_summary,
    next.desired_state,
    typeof next.execution_summary_json === 'string' ? next.execution_summary_json : JSON.stringify(next.execution_summary_json || null),
    runId,
  );
}

function updateStep(runId, stepIndex, patch) {
  const step = db.prepare('SELECT * FROM run_steps WHERE run_id = ? AND step_index = ?').get(runId, stepIndex);
  if (!step) return;
  const next = { ...step, ...patch };
  db.prepare(`
    UPDATE run_steps
    SET status = ?, started_at = ?, finished_at = ?
    WHERE run_id = ? AND step_index = ?
  `).run(next.status, next.started_at || null, next.finished_at || null, runId, stepIndex);
}

function getRunArtifacts(runId) {
  return db.prepare('SELECT * FROM run_artifacts WHERE run_id = ? ORDER BY created_at DESC').all(runId);
}

function getRunDir(runId) {
  const dir = path.join(dataDir, 'artifacts', runId);
  ensureDir(dir);
  return dir;
}

function writeTextFile(run, relativeName, content, kind = 'log', label = relativeName, contentType = 'text/plain', metadata = null) {
  const filePath = path.join(getRunDir(run.id), sanitizeName(relativeName));
  fs.writeFileSync(filePath, content, 'utf8');
  insertArtifact(run.id, kind, label, filePath, contentType, metadata);
  return filePath;
}

function writeJsonFile(run, relativeName, json, kind = 'evidence', label = relativeName) {
  const filePath = path.join(getRunDir(run.id), sanitizeName(relativeName));
  fs.writeFileSync(filePath, JSON.stringify(json, null, 2), 'utf8');
  insertArtifact(run.id, kind, label, filePath, 'application/json', { keys: Object.keys(json || {}) });
  return filePath;
}

function copyFileToRun(run, sourcePath, destName, kind = 'output', label = destName, metadata = null) {
  const filePath = path.join(getRunDir(run.id), sanitizeName(destName));
  fs.copyFileSync(sourcePath, filePath);
  insertArtifact(run.id, kind, label, filePath, undefined, metadata);
  return filePath;
}

function setExecutionSummary(runId, patch) {
  const current = db.prepare('SELECT execution_summary_json FROM runs WHERE id = ?').get(runId);
  const base = safeJsonParse(current && current.execution_summary_json, {}) || {};
  const next = { ...base, ...patch };
  db.prepare('UPDATE runs SET execution_summary_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(next), nowIso(), runId);
  return next;
}

function countRealArtifacts(runId) {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM run_artifacts WHERE run_id = ? AND kind IN ('output','evidence','replay')`).get(runId);
  return Number((row && row.count) || 0);
}

function recentArtifactLabels(runId) {
  return getRunArtifacts(runId).slice(0, 6).map((item) => item.label);
}

function stopRun(run) {
  const ts = nowIso();
  const steps = listSteps(run.id);
  steps
    .filter((step) => step.status === 'running' || step.status === 'pending')
    .forEach((step) => updateStep(run.id, step.step_index, {
      status: step.status === 'running' ? 'stopped' : step.status,
      finished_at: step.status === 'running' ? ts : step.finished_at,
    }));

  updateRunStatus(run.id, {
    status: 'stopped',
    updated_at: ts,
    live_summary: 'Stopped by operator',
    desired_state: 'stopped',
    execution_summary_json: setExecutionSummary(run.id, { stoppedAt: ts }),
  });
  insertEvent(run.id, 'warn', 'run_stopped', 'Run stopped by operator');
}

function startRun(run) {
  const ts = nowIso();
  updateRunStatus(run.id, {
    status: 'running',
    progress_percent: 0,
    started_at: run.started_at || ts,
    updated_at: ts,
    live_summary: run.execution_mode === 'real' ? `执行器 ${run.executor_type} 已接单` : 'Worker accepted run',
    execution_summary_json: setExecutionSummary(run.id, {
      executorType: run.executor_type,
      mode: run.execution_mode,
      acceptedAt: ts,
    }),
  });
  insertEvent(run.id, 'info', 'run_started', 'Worker accepted run', {
    executorType: run.executor_type,
    executionMode: run.execution_mode,
  });
}

function getPendingStep(steps) { return steps.find((step) => step.status === 'pending'); }
function getRunningStep(steps) { return steps.find((step) => step.status === 'running'); }
function computeProgress(steps) {
  const completed = steps.filter((step) => step.status === 'completed').length;
  return Math.round((completed / Math.max(1, steps.length)) * 100);
}

function failRun(run, step, error) {
  const ts = nowIso();
  if (step) {
    updateStep(run.id, step.step_index, { status: 'attention', finished_at: ts });
  }
  const errorMessage = error && error.stack ? error.stack : String(error);
  const errorLogPath = writeTextFile(run, `${Date.now()}-${step ? step.step_id : 'run'}-error.log`, errorMessage, 'log', step ? `${step.title} error log` : 'Run error log');
  const summary = setExecutionSummary(run.id, {
    lastError: String(error),
    latestLogPath: errorLogPath,
    realArtifactsCount: countRealArtifacts(run.id),
    lastArtifactLabels: recentArtifactLabels(run.id),
  });
  updateRunStatus(run.id, {
    status: 'attention',
    progress_percent: computeProgress(listSteps(run.id)),
    updated_at: ts,
    current_step_index: step ? step.step_index : run.current_step_index,
    live_summary: step ? `${step.title} 执行失败，等待人工介入` : 'Run failed',
    execution_summary_json: summary,
  });
  insertEvent(run.id, 'error', 'executor_failed', step ? `步骤失败：${step.title}` : 'Run failed', {
    error: String(error),
    stepId: step && step.step_id,
  });
}

function markStepRunning(run, step) {
  const ts = nowIso();
  updateStep(run.id, step.step_index, { status: 'running', started_at: ts, finished_at: null });
  updateRunStatus(run.id, {
    status: 'running',
    updated_at: ts,
    current_step_index: step.step_index,
    live_summary: `${step.title} 执行中`,
    progress_percent: computeProgress(listSteps(run.id)),
    execution_summary_json: setExecutionSummary(run.id, { currentStep: step.title }),
  });
  insertEvent(run.id, 'info', 'step_started', `Started step: ${step.title}`, {
    stepId: step.step_id,
    stepIndex: step.step_index,
    toolHint: step.tool_hint,
  });
}

function markStepCompleted(run, step, note) {
  const ts = nowIso();
  updateStep(run.id, step.step_index, { status: 'completed', started_at: step.started_at || ts, finished_at: ts });
  const updatedSteps = listSteps(run.id);
  const nextPending = getPendingStep(updatedSteps);
  const summary = setExecutionSummary(run.id, {
    lastCompletedStep: step.title,
    note,
    realArtifactsCount: countRealArtifacts(run.id),
    lastArtifactLabels: recentArtifactLabels(run.id),
  });
  updateRunStatus(run.id, {
    status: nextPending ? 'running' : 'completed',
    progress_percent: nextPending ? computeProgress(updatedSteps) : 100,
    updated_at: ts,
    completed_at: nextPending ? null : ts,
    current_step_index: nextPending ? nextPending.step_index : step.step_index,
    live_summary: nextPending ? `${nextPending.title} 排队中` : 'Run completed',
    execution_summary_json: summary,
  });
  insertEvent(run.id, 'info', 'step_completed', `Completed step: ${step.title}`, {
    stepId: step.step_id,
    stepIndex: step.step_index,
    note,
  });
  if (!nextPending) {
    insertEvent(run.id, 'info', 'run_completed', 'Run completed successfully');
  }
}

function ensureZipReplay(run) {
  const dir = getRunDir(run.id);
  const replayPath = path.join(dir, `${Date.now()}-replay-pack.zip`);
  const replayManifestPath = path.join(dir, 'replay-manifest.json');
  const artifacts = getRunArtifacts(run.id).map((artifact) => ({
    kind: artifact.kind,
    label: artifact.label,
    filePath: artifact.file_path,
    createdAt: artifact.created_at,
  }));
  fs.writeFileSync(replayManifestPath, JSON.stringify({
    runId: run.id,
    traceId: run.trace_id,
    target: run.target,
    executorType: run.executor_type,
    generatedAt: nowIso(),
    artifacts,
  }, null, 2), 'utf8');
  const zip = spawnSync('zip', ['-r', replayPath, '.'], { cwd: dir, encoding: 'utf8' });
  if (zip.status !== 0) {
    throw new Error(zip.stderr || zip.stdout || 'zip replay failed');
  }
  insertArtifact(run.id, 'replay', 'Replay pack', replayPath, 'application/zip', { generatedAt: nowIso() });
  setExecutionSummary(run.id, { replayPath, realArtifactsCount: countRealArtifacts(run.id), lastArtifactLabels: recentArtifactLabels(run.id) });
  return replayPath;
}

function dumpDomWithChromium(url, htmlPath) {
  const result = spawnSync(chromiumPath, ['--headless', '--disable-gpu', '--no-sandbox', '--dump-dom', url], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'chromium --dump-dom failed');
  }
  fs.writeFileSync(htmlPath, result.stdout, 'utf8');
}

function screenshotWithChromium(url, screenshotPath) {
  const result = spawnSync(chromiumPath, ['--headless', '--disable-gpu', '--no-sandbox', '--window-size=1440,1800', `--screenshot=${screenshotPath}`, url], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'chromium screenshot failed');
  }
}

function getBrowserStatePath(run) {
  return path.join(getRunDir(run.id), 'browser-state.json');
}

function readStateFile(filePath, fallback = {}) {
  return safeJsonParse(fileExists(filePath) ? fs.readFileSync(filePath, 'utf8') : '', fallback) || fallback;
}

function writeStateFile(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function normalizeBrowserActions(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : [];
}

function normalizeHeaderMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const entries = Object.entries(value).filter((entry) => typeof entry[1] === 'string');
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function normalizeSecretMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry) => typeof entry[1] === 'string'));
}

function normalizeBrowserCookies(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (!item || typeof item !== 'object') return null;
    const cookie = {
      name: String(item.name || '').trim(),
      value: String(item.value || ''),
    };
    if (!cookie.name) return null;
    if (typeof item.url === 'string' && item.url.trim()) {
      cookie.url = item.url.trim();
    } else if (typeof item.domain === 'string' && item.domain.trim()) {
      cookie.domain = item.domain.trim();
      cookie.path = typeof item.path === 'string' && item.path.trim() ? item.path.trim() : '/';
    } else {
      return null;
    }
    if (typeof item.httpOnly === 'boolean') cookie.httpOnly = item.httpOnly;
    if (typeof item.secure === 'boolean') cookie.secure = item.secure;
    if (typeof item.sameSite === 'string') cookie.sameSite = item.sameSite;
    if (typeof item.expires === 'number') cookie.expires = item.expires;
    return cookie;
  }).filter(Boolean);
}

function normalizeTotpConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const secret = String(value.secret || '').replace(/\s+/g, '').toUpperCase();
  if (!secret) return null;
  const digits = Math.max(6, Math.min(8, Number(value.digits || 6)));
  const period = Math.max(15, Math.min(120, Number(value.period || 30)));
  const algorithm = String(value.algorithm || 'SHA1').toUpperCase();
  if (!['SHA1', 'SHA256', 'SHA512'].includes(algorithm)) {
    throw new Error('browser totp algorithm 只支持 SHA1/SHA256/SHA512');
  }
  return {
    secret,
    issuer: value.issuer ? String(value.issuer) : null,
    accountName: value.accountName ? String(value.accountName) : null,
    digits,
    period,
    algorithm,
  };
}

function decodeBase32Secret(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = String(value || '').toUpperCase().replace(/=+$/g, '').replace(/\s+/g, '');
  let bits = '';
  for (const char of clean) {
    const index = alphabet.indexOf(char);
    if (index === -1) throw new Error(`invalid base32 secret character: ${char}`);
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  return Buffer.from(bytes);
}

function generateTotpCode(config, options = {}) {
  const totp = normalizeTotpConfig(config);
  if (!totp) throw new Error('browser fillTotp 缺少 totp.secret');
  const counter = Math.floor((Math.floor(Date.now() / 1000) + Number(options.offsetSeconds || 0)) / totp.period);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac(totp.algorithm.toLowerCase(), decodeBase32Secret(totp.secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);
  return String(code % (10 ** totp.digits)).padStart(totp.digits, '0');
}

function getBrowserStorageStatePath(input, options = {}) {
  if (typeof input?.storageStatePath !== 'string' || !input.storageStatePath.trim()) return null;
  const storageStatePath = input.storageStatePath.trim();
  if (!path.isAbsolute(storageStatePath)) throw new Error('browser storageStatePath 必须是绝对路径');
  if (options.mustExist && !fileExists(storageStatePath)) {
    throw new Error(`browser storageStatePath not found: ${storageStatePath}`);
  }
  if (!options.mustExist && !fileExists(storageStatePath)) {
    return null;
  }
  return storageStatePath;
}

function getBrowserContextOptions(input) {
  const options = {
    acceptDownloads: true,
    viewport: {
      width: Number(input?.viewport?.width || 1440),
      height: Number(input?.viewport?.height || 1600),
    },
  };

  const headers = normalizeHeaderMap(input?.extraHeaders);
  if (headers) options.extraHTTPHeaders = headers;
  if (typeof input?.userAgent === 'string' && input.userAgent.trim()) options.userAgent = input.userAgent.trim();
  if (typeof input?.locale === 'string' && input.locale.trim()) options.locale = input.locale.trim();

  if (input?.basicAuth && typeof input.basicAuth === 'object') {
    const username = String(input.basicAuth.username || '');
    const password = String(input.basicAuth.password || '');
    if (username || password) {
      options.httpCredentials = { username, password };
    }
  }

  const storageStatePath = getBrowserStorageStatePath(input, { mustExist: false });
  if (storageStatePath) {
    options.storageState = storageStatePath;
  }

  return options;
}

function browserNeedsContextBootstrap(input) {
  const headers = normalizeHeaderMap(input?.extraHeaders);
  return Boolean(
    getBrowserStorageStatePath(input, { mustExist: false })
    || (Array.isArray(input?.cookies) && input.cookies.length > 0)
    || (headers && Object.keys(headers).length > 0)
    || input?.userAgent
    || input?.locale
    || input?.basicAuth,
  );
}

async function createPlaywrightBrowserSession(input) {
  let playwright;
  try {
    playwright = require(playwrightCorePath);
  } catch (error) {
    throw new Error(`unable to load playwright-core: ${error.message}`);
  }
  const { chromium } = playwright;
  const browser = await chromium.launch({ headless: true, executablePath: chromiumPath, args: ['--no-sandbox'] });
  const context = await browser.newContext(getBrowserContextOptions(input));
  const cookies = normalizeBrowserCookies(input?.cookies);
  if (cookies.length > 0) {
    await context.addCookies(cookies);
  }
  const page = await context.newPage();
  return { browser, context, page };
}

async function captureBrowserOpenWithPlaywright(run, url, input, timestamp) {
  const dir = getRunDir(run.id);
  const timeout = Number(input.timeoutMs || 30000);
  const { browser, page } = await createPlaywrightBrowserSession(input);
  try {
    await page.goto(url, { waitUntil: input.waitUntil || 'networkidle', timeout });
    const screenshotPath = path.join(dir, `${timestamp}-browser-open.png`);
    const htmlPath = path.join(dir, `${timestamp}-browser-open.html`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    fs.writeFileSync(htmlPath, await page.content(), 'utf8');
    insertArtifact(run.id, 'evidence', '打开页面截图', screenshotPath, 'image/png', { url: page.url(), via: 'playwright' });
    insertArtifact(run.id, 'output', '打开页面 HTML', htmlPath, 'text/html', { url: page.url(), via: 'playwright' });
    return {
      screenshotPath,
      htmlPath,
      finalUrl: page.url(),
      title: await page.title(),
    };
  } finally {
    await browser.close();
  }
}

function getBrowserActionPageAlias(action, browserState) {
  if (typeof action.page === 'string' && action.page.trim()) return action.page.trim();
  if (typeof action.pageAlias === 'string' && action.pageAlias.trim()) return action.pageAlias.trim();
  return browserState.currentPageAlias;
}

function getBrowserPageState(action, browserState) {
  const alias = getBrowserActionPageAlias(action, browserState);
  const page = browserState.pages.get(alias);
  if (!page || page.isClosed()) {
    throw new Error(`browser page alias not available: ${alias}`);
  }
  return { alias, page };
}

async function listBrowserOpenPages(browserState) {
  const pages = [];
  for (const [alias, page] of browserState.pages.entries()) {
    if (!page || page.isClosed()) continue;
    let title = null;
    try {
      title = await page.title();
    } catch {}
    pages.push({ alias, url: page.url(), title });
  }
  return pages;
}

async function runBrowserActions(run, context, page, input, timestamp) {
  const dir = getRunDir(run.id);
  const timeout = Number(input.timeoutMs || 30000);
  const actions = normalizeBrowserActions(input.actions);
  const results = [];
  const secretMap = normalizeSecretMap(input?.secrets);
  const totpConfig = normalizeTotpConfig(input?.totp);
  const profileStorageStatePath = typeof input?.storageStatePath === 'string' && input.storageStatePath.trim()
    ? input.storageStatePath.trim()
    : null;
  const browserState = {
    pages: new Map([['main', page]]),
    currentPageAlias: 'main',
    pageCounter: 1,
  };

  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index] || {};
    const type = String(action.type || action.kind || '').trim().toLowerCase();
    const selector = typeof action.selector === 'string' ? action.selector : undefined;
    const label = typeof action.label === 'string' && action.label.trim() ? action.label.trim() : `action-${index + 1}`;
    const startedAt = nowIso();
    let activePage = null;
    let activeAlias = browserState.currentPageAlias;
    const result = {
      index,
      type,
      selector: selector || null,
      label,
      startedAt,
      pageAlias: activeAlias,
      status: 'completed',
    };

    try {
      if (!type) {
        throw new Error('browser action missing type');
      }

      if (type === 'switchpage') {
        const alias = String(action.to || action.alias || action.targetPage || '').trim();
        if (!alias) throw new Error('switchPage requires target alias');
        const nextPage = browserState.pages.get(alias);
        if (!nextPage || nextPage.isClosed()) throw new Error(`switchPage target not available: ${alias}`);
        browserState.currentPageAlias = alias;
        activeAlias = alias;
        activePage = nextPage;
        result.pageAlias = alias;
        result.detail = `switched to page ${alias}`;
      } else if (type === 'closepage') {
        const alias = String(action.page || action.alias || browserState.currentPageAlias || '').trim();
        if (!alias) throw new Error('closePage requires alias');
        const closePage = browserState.pages.get(alias);
        if (!closePage || closePage.isClosed()) throw new Error(`closePage target not available: ${alias}`);
        if (alias === 'main' && browserState.pages.size === 1) throw new Error('cannot close the only remaining page');
        await closePage.close();
        browserState.pages.delete(alias);
        if (browserState.currentPageAlias === alias) {
          browserState.currentPageAlias = browserState.pages.has('main') ? 'main' : Array.from(browserState.pages.keys())[0];
        }
        activeAlias = alias;
        result.pageAlias = alias;
        result.detail = `closed page ${alias}`;
      } else if (type === 'listpages') {
        result.pages = await listBrowserOpenPages(browserState);
        result.detail = `listed ${result.pages.length} open pages`;
      } else if (type === 'clicknewpage' || type === 'opennewpage' || type === 'popup' || type === 'newpage') {
        const sourceState = getBrowserPageState(action, browserState);
        activeAlias = sourceState.alias;
        activePage = sourceState.page;
        const nextAlias = String(action.newPageAlias || action.alias || action.targetPage || `page-${browserState.pageCounter + 1}`).trim();
        let nextPage;
        if (typeof action.url === 'string' && action.url.trim()) {
          nextPage = await context.newPage();
          await nextPage.goto(action.url.trim(), { waitUntil: action.waitUntil || input.waitUntil || 'networkidle', timeout });
        } else {
          if (!selector) throw new Error('clickNewPage requires selector or url');
          const [openedPage] = await Promise.all([
            context.waitForEvent('page', { timeout }),
            activePage.locator(selector).first().click({ timeout }),
          ]);
          nextPage = openedPage;
          const loadState = String(action.waitUntil || input.waitUntil || 'load');
          await nextPage.waitForLoadState(loadState, { timeout }).catch(() => {});
        }
        browserState.pageCounter += 1;
        browserState.pages.set(nextAlias, nextPage);
        if (action.switchTo !== false) {
          browserState.currentPageAlias = nextAlias;
        }
        result.pageAlias = nextAlias;
        result.newPageAlias = nextAlias;
        result.detail = `opened new page ${nextAlias}`;
        result.url = nextPage.url();
      } else if (type === 'download' || type === 'expectdownload') {
        const pageState = getBrowserPageState(action, browserState);
        activeAlias = pageState.alias;
        activePage = pageState.page;
        if (!selector) throw new Error('download requires selector');
        const suggestedName = sanitizeName(action.fileName || `download-${index + 1}`);
        const downloadPath = path.join(dir, `${timestamp}-browser-download-${index + 1}-${suggestedName}`);
        let downloadedVia = 'playwright-download';
        try {
          const [download] = await Promise.all([
            activePage.waitForEvent('download', { timeout }),
            activePage.locator(selector).first().click({ timeout }),
          ]);
          const actualName = sanitizeName(action.fileName || download.suggestedFilename() || suggestedName);
          const actualPath = path.join(dir, `${timestamp}-browser-download-${index + 1}-${actualName}`);
          await download.saveAs(actualPath);
          result.downloadPath = actualPath;
          result.downloadFileName = path.basename(actualPath);
        } catch (error) {
          const href = await activePage.locator(selector).first().getAttribute('href');
          if (!href) {
            throw error;
          }
          const resolvedUrl = new URL(href, activePage.url()).toString();
          const response = await context.request.get(resolvedUrl, { timeout, failOnStatusCode: false });
          if (!response.ok()) {
            throw new Error(`download fallback failed: ${response.status()} ${response.statusText()}`);
          }
          fs.writeFileSync(downloadPath, await response.body());
          result.downloadPath = downloadPath;
          result.downloadFileName = path.basename(downloadPath);
          result.downloadUrl = resolvedUrl;
          downloadedVia = 'context-request-fallback';
        }
        insertArtifact(run.id, 'output', `浏览器下载：${label}`, result.downloadPath, undefined, { actionIndex: index, pageAlias: activeAlias, actionType: type, via: downloadedVia });
        result.detail = `downloaded ${path.basename(result.downloadPath)} via ${downloadedVia}`;
      } else if (type === 'savestoragestate' || type === 'exportstoragestate') {
        const storagePath = path.join(dir, `${timestamp}-browser-storage-state-${index + 1}.json`);
        await context.storageState({ path: storagePath });
        insertArtifact(run.id, 'output', 'Browser storage state', storagePath, 'application/json', { actionIndex: index, actionType: type });
        result.storageStatePath = storagePath;
        result.detail = `saved storage state ${path.basename(storagePath)}`;
      } else if (type === 'saveprofilestoragestate' || type === 'commitprofilestoragestate') {
        if (!profileStorageStatePath) throw new Error('saveProfileStorageState requires executionInput.storageStatePath');
        if (!path.isAbsolute(profileStorageStatePath)) throw new Error('saveProfileStorageState 需要绝对路径 storageStatePath');
        ensureDir(path.dirname(profileStorageStatePath));
        await context.storageState({ path: profileStorageStatePath });
        insertArtifact(run.id, 'output', 'Browser profile storage state', profileStorageStatePath, 'application/json', { actionIndex: index, actionType: type, storageStatePath: profileStorageStatePath });
        result.storageStatePath = profileStorageStatePath;
        result.detail = `saved profile storage state ${path.basename(profileStorageStatePath)}`;
      } else {
        const pageState = getBrowserPageState(action, browserState);
        activeAlias = pageState.alias;
        activePage = pageState.page;
        result.pageAlias = activeAlias;

        if (type === 'wait' || type === 'waitfortimeout') {
          const ms = Number(action.ms || action.timeoutMs || action.timeout || 800);
          await activePage.waitForTimeout(ms);
          result.detail = `waited ${ms}ms`;
        } else if (type === 'waitforselector') {
          if (!selector) throw new Error('waitForSelector requires selector');
          const state = typeof action.state === 'string' ? action.state : 'visible';
          await activePage.waitForSelector(selector, { state, timeout });
          result.detail = `selector ${selector} is ${state}`;
        } else if (type === 'waitforloadstate') {
          const state = String(action.state || action.waitUntil || input.waitUntil || 'networkidle');
          await activePage.waitForLoadState(state, { timeout });
          result.detail = `page load state ${state}`;
        } else if (type === 'waitforurl') {
          const expected = String(action.expected || action.url || action.value || action.text || '').trim();
          if (!expected) throw new Error('waitForUrl requires expected/url/value');
          const mode = String(action.mode || 'includes').toLowerCase();
          await activePage.waitForURL((currentUrl) => {
            const current = String(currentUrl || '');
            if (mode === 'equals') return current === expected;
            if (mode === 'regex') return new RegExp(expected).test(current);
            return current.includes(expected);
          }, { timeout });
          result.expected = expected;
          result.mode = mode;
          result.detail = `url matched ${mode} ${expected}`;
        } else if (type === 'click') {
          if (!selector) throw new Error('click requires selector');
          await activePage.locator(selector).first().click({ timeout });
          result.detail = `clicked ${selector}`;
        } else if (type === 'fill' || type === 'type' || type === 'input') {
          if (!selector) throw new Error(`${type} requires selector`);
          const value = action.value == null ? '' : String(action.value);
          await activePage.locator(selector).first().fill(value, { timeout });
          result.detail = `filled ${selector}`;
          result.valuePreview = value.slice(0, 120);
        } else if (type === 'fillsecret' || type === 'fillcredential' || type === 'fillfromsecret') {
          if (!selector) throw new Error(`${type} requires selector`);
          const key = String(action.key || action.secretKey || action.credentialKey || action.valueKey || '').trim();
          if (!key) throw new Error(`${type} requires key/secretKey/credentialKey`);
          if (!(key in secretMap)) throw new Error(`browser secret key not found: ${key}`);
          await activePage.locator(selector).first().fill(String(secretMap[key] || ''), { timeout });
          result.detail = `filled ${selector} from secret:${key}`;
          result.valuePreview = `[secret:${key}]`;
        } else if (type === 'filltotp' || type === 'fillotp' || type === 'typetotp') {
          if (!selector) throw new Error(`${type} requires selector`);
          const actionTotp = action.totp && typeof action.totp === 'object' ? action.totp : null;
          const code = generateTotpCode(actionTotp ? { ...(totpConfig || input?.totp || {}), ...actionTotp } : (totpConfig || input?.totp || null), {
            offsetSeconds: Number(action.offsetSeconds || 0),
          });
          await activePage.locator(selector).first().fill(code, { timeout });
          result.detail = `filled ${selector} from TOTP`;
          result.valuePreview = '[totp]';
          result.totpDigits = code.length;
        } else if (type === 'press') {
          const key = String(action.key || 'Enter');
          if (selector) {
            await activePage.locator(selector).first().press(key, { timeout });
          } else {
            await activePage.keyboard.press(key);
          }
          result.detail = `pressed ${key}`;
        } else if (type === 'select') {
          if (!selector) throw new Error('select requires selector');
          const value = action.value;
          if (Array.isArray(value)) {
            await activePage.locator(selector).first().selectOption(value.map((item) => String(item)));
            result.detail = `selected ${value.join(',')}`;
          } else {
            await activePage.locator(selector).first().selectOption(String(value ?? ''));
            result.detail = `selected ${String(value ?? '')}`;
          }
        } else if (type === 'check') {
          if (!selector) throw new Error('check requires selector');
          await activePage.locator(selector).first().check({ timeout });
          result.detail = `checked ${selector}`;
        } else if (type === 'uncheck') {
          if (!selector) throw new Error('uncheck requires selector');
          await activePage.locator(selector).first().uncheck({ timeout });
          result.detail = `unchecked ${selector}`;
        } else if (type === 'hover') {
          if (!selector) throw new Error('hover requires selector');
          await activePage.locator(selector).first().hover({ timeout });
          result.detail = `hovered ${selector}`;
        } else if (type === 'goto') {
          const nextUrl = String(action.url || action.href || '');
          if (!nextUrl) throw new Error('goto requires url');
          await activePage.goto(nextUrl, { waitUntil: action.waitUntil || input.waitUntil || 'networkidle', timeout });
          result.detail = `navigated to ${nextUrl}`;
        } else if (type === 'extracttext') {
          if (!selector) throw new Error('extractText requires selector');
          const value = await activePage.locator(selector).first().innerText({ timeout });
          result.detail = `extracted text from ${selector}`;
          result.extractedText = String(value || '').trim().slice(0, 2000);
        } else if (type === 'assertexists') {
          if (!selector) throw new Error('assertExists requires selector');
          await activePage.waitForSelector(selector, { state: 'attached', timeout });
          result.detail = `asserted ${selector} exists`;
        } else if (type === 'asserttext') {
          const textSelector = selector || 'body';
          const actual = String(await activePage.locator(textSelector).first().innerText({ timeout }) || '').trim();
          const expected = String(action.text ?? action.expected ?? action.value ?? '').trim();
          const mode = String(action.mode || (action.equals ? 'equals' : 'includes')).toLowerCase();
          if (!expected) throw new Error('assertText requires expected/text/value');
          const passed = mode === 'equals' ? actual === expected : actual.includes(expected);
          result.actualPreview = actual.slice(0, 240);
          result.expected = expected;
          result.mode = mode;
          if (!passed) {
            throw new Error(`assertText failed on ${textSelector}: expected ${mode} "${expected}" but got "${actual.slice(0, 240)}"`);
          }
          result.detail = `asserted text ${mode} ${expected}`;
        } else if (type === 'asserturlincludes') {
          const expected = String(action.text ?? action.expected ?? action.value ?? action.url ?? '').trim();
          if (!expected) throw new Error('assertUrlIncludes requires expected text');
          const actualUrl = activePage.url();
          if (!actualUrl.includes(expected)) {
            throw new Error(`assertUrlIncludes failed: ${actualUrl} does not include ${expected}`);
          }
          result.expected = expected;
          result.detail = `asserted URL includes ${expected}`;
        } else if (type === 'assertvalue') {
          if (!selector) throw new Error('assertValue requires selector');
          const expected = String(action.text ?? action.expected ?? action.value ?? '').trim();
          const actual = String(await activePage.locator(selector).first().inputValue({ timeout }) || '');
          result.actualPreview = actual.slice(0, 240);
          result.expected = expected;
          if (actual !== expected) {
            throw new Error(`assertValue failed on ${selector}: expected "${expected}" but got "${actual.slice(0, 240)}"`);
          }
          result.detail = `asserted value equals ${expected}`;
        } else if (type === 'scroll') {
          const position = String(action.position || '').toLowerCase();
          const x = Number(action.x || 0);
          const y = Number(action.y || 0);
          if (position === 'bottom') {
            await activePage.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
            result.detail = 'scrolled to bottom';
          } else if (position === 'top') {
            await activePage.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
            result.detail = 'scrolled to top';
          } else {
            await activePage.evaluate(({ sx, sy }) => window.scrollBy(sx, sy), { sx: x, sy: y });
            result.detail = `scrolled by ${x},${y}`;
          }
        } else if (type === 'screenshot') {
          const shotPath = path.join(dir, `${timestamp}-browser-action-${index + 1}-${sanitizeName(activeAlias)}.png`);
          await activePage.screenshot({ path: shotPath, fullPage: action.fullPage !== false });
          insertArtifact(run.id, 'evidence', `动作截图：${label}`, shotPath, 'image/png', { actionIndex: index, actionType: type, pageAlias: activeAlias });
          result.detail = `captured screenshot ${path.basename(shotPath)}`;
          result.screenshotPath = shotPath;
        } else {
          throw new Error(`unsupported browser action: ${type}`);
        }
      }

      result.finishedAt = nowIso();
      if (activePage && !activePage.isClosed()) {
        result.url = activePage.url();
      }
      results.push(result);
    } catch (error) {
      result.status = 'failed';
      result.finishedAt = nowIso();
      result.error = String(error && error.message ? error.message : error);
      if (activePage && !activePage.isClosed()) {
        result.url = activePage.url();
      }
      results.push(result);
      throw new Error(`browser action ${index + 1} (${type}) failed: ${result.error}`);
    }
  }

  const actionLog = {
    runId: run.id,
    traceId: run.trace_id,
    capturedAt: nowIso(),
    count: results.length,
    currentPageAlias: browserState.currentPageAlias,
    openPages: await listBrowserOpenPages(browserState),
    results,
  };
  const actionLogPath = path.join(dir, `${timestamp}-browser-actions.json`);
  fs.writeFileSync(actionLogPath, JSON.stringify(actionLog, null, 2), 'utf8');
  insertArtifact(run.id, 'output', 'Browser action log', actionLogPath, 'application/json', { count: results.length, pageCount: actionLog.openPages.length });
  return { actionLogPath, results, openPages: actionLog.openPages, currentPageAlias: browserState.currentPageAlias };
}

async function executeBrowserStep(run, step, input) {
  const dir = getRunDir(run.id);
  const timestamp = Date.now();
  const statePath = getBrowserStatePath(run);
  const state = readStateFile(statePath, {});
  if (!input || !input.url) throw new Error('browser executor missing executionInput.url');
  const url = String(input.url);
  const actions = normalizeBrowserActions(input.actions);

  if (step.step_id === 'plan') {
    const contextOptions = getBrowserContextOptions(input);
    const storageStatePath = typeof input?.storageStatePath === 'string' ? input.storageStatePath.trim() : null;
    const plan = {
      runId: run.id,
      traceId: run.trace_id,
      executorType: run.executor_type,
      mode: run.execution_mode,
      target: run.target,
      url,
      waitUntil: input.waitUntil || 'networkidle',
      timeoutMs: input.timeoutMs || 30000,
      captureHtml: input.captureHtml !== false,
      captureScreenshot: input.captureScreenshot !== false,
      actionsCount: actions.length,
      sessionBootstrap: browserNeedsContextBootstrap(input),
      storageStatePath: contextOptions.storageState || storageStatePath || null,
      storageStateExists: Boolean(contextOptions.storageState),
      persistProfileStorageState: input.persistProfileStorageState === true,
      hasExtraHeaders: Boolean(contextOptions.extraHTTPHeaders),
      cookiesCount: normalizeBrowserCookies(input.cookies).length,
      secretKeys: Object.keys(normalizeSecretMap(input.secrets)),
      hasTotp: Boolean(normalizeTotpConfig(input.totp)),
      generatedAt: nowIso(),
    };
    writeJsonFile(run, `${timestamp}-browser-plan.json`, plan, 'evidence', 'Browser execution plan');
    const logPath = writeTextFile(run, `${timestamp}-browser-plan.log`, `browser executor plan\nurl=${url}\ntraceId=${run.trace_id}\nactions=${actions.length}\nsessionBootstrap=${plan.sessionBootstrap}\nstorageStatePath=${plan.storageStatePath || '-'}\nstorageStateExists=${plan.storageStateExists}\npersistProfileStorageState=${plan.persistProfileStorageState}\ncookies=${plan.cookiesCount}\nheaders=${plan.hasExtraHeaders}\nsecretKeys=${plan.secretKeys.join(',') || '-'}\nhasTotp=${plan.hasTotp}\n`, 'log', 'Browser plan log');
    writeStateFile(statePath, { ...state, url, plan, planLogPath: logPath });
    setExecutionSummary(run.id, { latestLogPath: logPath, notes: [`已生成 browser 计划，动作数 ${actions.length}`] });
    return '生成 browser 执行计划';
  }

  if (step.step_id === 'open') {
    let screenshotPath;
    let htmlPath;
    let finalUrl = url;
    let pageTitle = null;
    if (browserNeedsContextBootstrap(input)) {
      const captured = await captureBrowserOpenWithPlaywright(run, url, input, timestamp);
      screenshotPath = captured.screenshotPath;
      htmlPath = captured.htmlPath;
      finalUrl = captured.finalUrl || url;
      pageTitle = captured.title || null;
    } else {
      screenshotPath = path.join(dir, `${timestamp}-browser-open.png`);
      htmlPath = path.join(dir, `${timestamp}-browser-open.html`);
      screenshotWithChromium(url, screenshotPath);
      dumpDomWithChromium(url, htmlPath);
      insertArtifact(run.id, 'evidence', '打开页面截图', screenshotPath, 'image/png', { url });
      insertArtifact(run.id, 'output', '打开页面 HTML', htmlPath, 'text/html', { url });
    }
    writeStateFile(statePath, { ...state, url, openScreenshotPath: screenshotPath, openHtmlPath: htmlPath, openFinalUrl: finalUrl, openPageTitle: pageTitle, openedAt: nowIso() });
    setExecutionSummary(run.id, { latestOutputPath: htmlPath, openFinalUrl: finalUrl, pageTitle });
    return browserNeedsContextBootstrap(input)
      ? `已基于会话注入真实打开 ${finalUrl} 并抓取首屏截图/HTML`
      : `已真实打开 ${url} 并抓取首屏截图/HTML`;
  }

  if (step.step_id === 'execute') {
    const { browser, context, page } = await createPlaywrightBrowserSession(input);
    const timeout = Number(input.timeoutMs || 30000);
    try {
      await page.goto(url, { waitUntil: input.waitUntil || 'networkidle', timeout });
      let actionLogPath = null;
      let actionResults = [];
      let openPages = [{ alias: 'main', url: page.url(), title: await page.title() }];
      let currentPageAlias = 'main';
      if (actions.length > 0) {
        const actionResult = await runBrowserActions(run, context, page, input, timestamp);
        actionLogPath = actionResult.actionLogPath;
        actionResults = actionResult.results;
        openPages = actionResult.openPages;
        currentPageAlias = actionResult.currentPageAlias || 'main';
      }
      const title = await page.title();
      const links = await page.$$eval('a', (nodes) => nodes.slice(0, 20).map((node) => ({ text: (node.textContent || '').trim(), href: node.href })).filter((item) => item.href));
      const summary = await page.evaluate(() => ({
        title: document.title,
        url: location.href,
        heading: document.querySelector('h1,h2,h3')?.textContent?.trim() || null,
        textSnippet: document.body?.innerText?.trim()?.slice(0, 1200) || null,
      }));
      const screenshotPath = path.join(dir, `${timestamp}-browser-execute.png`);
      const htmlPath = path.join(dir, `${timestamp}-browser-execute.html`);
      const jsonPath = path.join(dir, `${timestamp}-browser-summary.json`);
      const profileStorageStatePath = typeof input.storageStatePath === 'string' && input.storageStatePath.trim() ? input.storageStatePath.trim() : null;
      let savedStorageStatePath = null;
      let savedProfileStorageStatePath = null;
      await page.screenshot({ path: screenshotPath, fullPage: true });
      fs.writeFileSync(htmlPath, await page.content(), 'utf8');
      if (input.saveStorageState === true) {
        savedStorageStatePath = path.join(dir, `${timestamp}-browser-final-storage-state.json`);
        await context.storageState({ path: savedStorageStatePath });
        insertArtifact(run.id, 'output', 'Browser final storage state', savedStorageStatePath, 'application/json', { fromStep: 'execute' });
      }
      if (input.persistProfileStorageState === true && profileStorageStatePath) {
        ensureDir(path.dirname(profileStorageStatePath));
        await context.storageState({ path: profileStorageStatePath });
        savedProfileStorageStatePath = profileStorageStatePath;
        insertArtifact(run.id, 'output', 'Browser persisted profile state', profileStorageStatePath, 'application/json', { fromStep: 'execute', storageStatePath: profileStorageStatePath });
      }
      fs.writeFileSync(jsonPath, JSON.stringify({
        title,
        summary,
        links,
        actionResults,
        openPages,
        currentPageAlias,
        browserContext: {
          sessionBootstrap: browserNeedsContextBootstrap(input),
          storageStatePath: input.storageStatePath || null,
          storageStateExists: Boolean(getBrowserStorageStatePath(input, { mustExist: false })),
          savedStorageStatePath,
          savedProfileStorageStatePath,
          persistProfileStorageState: input.persistProfileStorageState === true,
          headersInjected: Boolean(normalizeHeaderMap(input.extraHeaders)),
          cookiesInjected: normalizeBrowserCookies(input.cookies).length,
          secretKeys: Object.keys(normalizeSecretMap(input.secrets)),
          hasTotp: Boolean(normalizeTotpConfig(input.totp)),
          locale: input.locale || null,
          userAgent: input.userAgent || null,
        },
        capturedAt: nowIso(),
      }, null, 2), 'utf8');
      insertArtifact(run.id, 'evidence', '执行态截图', screenshotPath, 'image/png', { url: page.url(), title });
      insertArtifact(run.id, 'output', '执行态 HTML', htmlPath, 'text/html', { url: page.url(), title });
      insertArtifact(run.id, 'output', '页面结构摘要', jsonPath, 'application/json', { links: links.length, actions: actionResults.length, pages: openPages.length });
      writeStateFile(statePath, {
        ...state,
        url,
        executedAt: nowIso(),
        pageTitle: title,
        finalUrl: page.url(),
        executeScreenshotPath: screenshotPath,
        executeHtmlPath: htmlPath,
        summaryPath: jsonPath,
        actionLogPath,
        actionResults,
        openPages,
        currentPageAlias,
        savedStorageStatePath,
        savedProfileStorageStatePath,
      });
      setExecutionSummary(run.id, {
        latestOutputPath: jsonPath,
        pageTitle: title,
        actionLogPath,
        actionsExecuted: actionResults.length,
        pageCount: openPages.length,
        currentPageAlias,
        sessionBootstrap: browserNeedsContextBootstrap(input),
        savedStorageStatePath,
        savedProfileStorageStatePath,
      });
      return actionResults.length > 0
        ? `已用 Playwright 完成 ${actionResults.length} 个 DOM 动作并采集页面摘要`
        : '已用 Playwright 采集页面标题、正文摘要、链接清单并截图';
    } finally {
      await browser.close();
    }
  }

  if (step.step_id === 'verify') {
    const live = readStateFile(statePath, {});
    const artifacts = getRunArtifacts(run.id);
    const htmlArtifact = artifacts.find((artifact) => /HTML/.test(artifact.label) || String(artifact.file_path).endsWith('.html'));
    const screenshotArtifact = artifacts.find((artifact) => String(artifact.file_path).endsWith('.png'));
    const actionLogExists = live.actionLogPath ? fileExists(live.actionLogPath) : false;
    const verification = {
      url,
      finalUrl: live.finalUrl || url,
      htmlCaptured: Boolean(htmlArtifact && fileExists(htmlArtifact.file_path)),
      screenshotCaptured: Boolean(screenshotArtifact && fileExists(screenshotArtifact.file_path)),
      actionCount: Array.isArray(live.actionResults) ? live.actionResults.length : 0,
      pageCount: Array.isArray(live.openPages) ? live.openPages.length : 1,
      currentPageAlias: live.currentPageAlias || 'main',
      savedStorageState: Boolean(live.savedStorageStatePath && fileExists(live.savedStorageStatePath)),
      savedProfileStorageState: Boolean(live.savedProfileStorageStatePath && fileExists(live.savedProfileStorageStatePath)),
      actionLogExists,
      artifactCount: artifacts.length,
      verifiedAt: nowIso(),
    };
    const verificationPath = writeJsonFile(run, `${timestamp}-browser-verify.json`, verification, 'evidence', 'Browser verify report');
    const markdownPath = writeTextFile(run, `${timestamp}-browser-verify.md`, [
      '# Browser verify report',
      '',
      `- url: ${url}`,
      `- finalUrl: ${verification.finalUrl}`,
      `- htmlCaptured: ${verification.htmlCaptured}`,
      `- screenshotCaptured: ${verification.screenshotCaptured}`,
      `- actionCount: ${verification.actionCount}`,
      `- pageCount: ${verification.pageCount}`,
      `- currentPageAlias: ${verification.currentPageAlias}`,
      `- savedStorageState: ${verification.savedStorageState}`,
      `- savedProfileStorageState: ${verification.savedProfileStorageState}`,
      `- actionLogExists: ${verification.actionLogExists}`,
      `- artifactCount: ${verification.artifactCount}`,
      '',
      verification.actionCount > 0
        ? '结论：页面真实打开、DOM 动作已执行、证据已落盘、可回放。'
        : '结论：页面真实打开、真实落盘、可回放。',
    ].join('\n'), 'evidence', 'Browser verify markdown', 'text/markdown');
    writeStateFile(statePath, { ...live, verifyPath: verificationPath, verifyMarkdownPath: markdownPath, verifiedAt: nowIso() });
    setExecutionSummary(run.id, { latestOutputPath: verificationPath, notes: ['browser 验收已完成', markdownPath] });
    return verification.actionCount > 0 ? '完成 browser 动作执行与结构化验收' : '完成 browser 截图/HTML/摘要的结构化验收';
  }

  if (step.step_id === 'handoff') {
    const replayPath = ensureZipReplay(run);
    return `已打包 replay：${path.basename(replayPath)}`;
  }

  return 'browser step skipped';
}

function resolveDownloadDestination(run, source, archiveName) {
  const baseName = archiveName || sanitizeName(path.basename(new URL(source).pathname || 'download.bin')) || 'download.bin';
  return path.join(getRunDir(run.id), `${Date.now()}-${baseName}`);
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function serializeCookieHeader(value) {
  if (!Array.isArray(value)) return undefined;
  const parts = value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const name = String(item.name || '').trim();
      if (!name) return null;
      return `${name}=${String(item.value || '')}`;
    })
    .filter(Boolean);
  return parts.length > 0 ? parts.join('; ') : undefined;
}

function buildMediaRequestHeaders(input) {
  const headers = { ...(normalizeHeaderMap(input?.sourceHeaders) || {}) };
  const cookieHeader = serializeCookieHeader(input?.sourceCookies);
  if (cookieHeader) headers.cookie = cookieHeader;
  if (typeof input?.sourceUserAgent === 'string' && input.sourceUserAgent.trim()) {
    headers['user-agent'] = input.sourceUserAgent.trim();
  }
  return headers;
}

function isRetryableStatus(status) {
  return [408, 409, 425, 429, 500, 502, 503, 504].includes(Number(status));
}

async function fetchWithRetry(url, init = {}, retryOptions = {}) {
  const retries = Math.max(0, Number(retryOptions.retries ?? 0));
  const backoffMs = Math.max(100, Number(retryOptions.backoffMs ?? 500));
  const label = retryOptions.label || 'request';
  let attempt = 0;
  let lastError = null;

  while (attempt <= retries) {
    attempt += 1;
    try {
      const response = await fetch(url, init);
      if (response.ok || attempt > retries || !isRetryableStatus(response.status)) {
        return { response, attempts: attempt };
      }
      lastError = new Error(`${label} failed: ${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
      if (attempt > retries) {
        throw error;
      }
    }
    await sleepMs(backoffMs * attempt);
  }

  throw lastError || new Error(`${label} failed`);
}

async function downloadToFile(url, filePath, options = {}) {
  const { response, attempts } = await fetchWithRetry(url, {
    method: 'GET',
    headers: options.headers || {},
  }, {
    retries: options.retries,
    backoffMs: options.backoffMs,
    label: 'media download',
  });
  if (!response.ok) throw new Error(`download failed: ${response.status} ${response.statusText}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(filePath, bytes);
  return { bytes: bytes.length, attempts, contentType: response.headers.get('content-type') || null };
}

function runFfprobe(filePath) {
  const result = spawnSync('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'ffprobe failed');
  }
  return JSON.parse(result.stdout || '{}');
}

function maybeExtractFrame(filePath, outputPath) {
  const result = spawnSync('ffmpeg', ['-y', '-i', filePath, '-frames:v', '1', outputPath], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  return result.status === 0 && fileExists(outputPath);
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function describeDeliveredFile(filePath, includeChecksum = true) {
  if (!filePath || !fileExists(filePath)) return null;
  const stats = fs.statSync(filePath);
  return {
    filePath,
    fileName: path.basename(filePath),
    bytes: stats.size,
    sha256: includeChecksum ? sha256File(filePath) : null,
  };
}

async function postJson(url, payload, headers = {}, retryOptions = {}) {
  const { response, attempts } = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(payload),
  }, {
    retries: retryOptions.retries,
    backoffMs: retryOptions.backoffMs,
    label: 'media webhook',
  });
  const text = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    attempts,
    body: safeJsonParse(text, text),
  };
}

async function executeMediaStep(run, step, input) {
  const timestamp = Date.now();
  if (!input || !input.source) throw new Error('media executor missing executionInput.source');
  const source = String(input.source);
  const runDir = getRunDir(run.id);
  const statePath = path.join(runDir, 'media-state.json');
  const state = safeJsonParse(fileExists(statePath) ? fs.readFileSync(statePath, 'utf8') : '', {}) || {};

  if (step.step_id === 'prepare') {
    const sourceHeaders = buildMediaRequestHeaders(input);
    const manifest = {
      runId: run.id,
      traceId: run.trace_id,
      source,
      sourceType: isUrl(source) ? 'url' : 'local-file',
      archiveName: input.archiveName || null,
      extractFrame: input.extractFrame !== false,
      deliveryDir: input.deliveryDir || null,
      deliveryWebhookUrl: input.deliveryWebhookUrl || null,
      sourceHeaderKeys: Object.keys(sourceHeaders),
      sourceCookiesCount: Array.isArray(input.sourceCookies) ? input.sourceCookies.length : 0,
      sourceRetries: Number(input.sourceRetries || 0),
      deliveryWebhookRetries: Number(input.deliveryWebhookRetries || 0),
      emitChecksums: input.emitChecksums !== false,
      preparedAt: nowIso(),
    };
    fs.writeFileSync(statePath, JSON.stringify({ ...state, source, manifest }, null, 2), 'utf8');
    writeJsonFile(run, `${timestamp}-media-request.json`, manifest, 'evidence', 'Media request manifest');
    const prepLog = writeTextFile(run, `${timestamp}-media-prepare.log`, `prepare media source\nsource=${source}\nsourceType=${manifest.sourceType}\n`, 'log', 'Media prepare log');
    setExecutionSummary(run.id, { latestLogPath: prepLog, source });
    return '已标准化 media 输入并生成 request manifest';
  }

  if (step.step_id === 'submit') {
    let outputPath;
    let bytes;
    let contentType = null;
    let downloadAttempts = 0;
    if (isUrl(source)) {
      outputPath = resolveDownloadDestination(run, source, input.archiveName);
      const downloadResult = await downloadToFile(source, outputPath, {
        headers: buildMediaRequestHeaders(input),
        retries: Number(input.sourceRetries || 0),
        backoffMs: Number(input.sourceBackoffMs || 600),
      });
      bytes = downloadResult.bytes;
      contentType = downloadResult.contentType;
      downloadAttempts = downloadResult.attempts;
    } else {
      if (!path.isAbsolute(source)) throw new Error('media local source 必须是绝对路径');
      if (!fileExists(source)) throw new Error(`media local source not found: ${source}`);
      outputPath = copyFileToRun(run, source, input.archiveName || path.basename(source), 'output', 'Media archived source', { sourceType: 'local-file' });
      bytes = fs.statSync(outputPath).size;
    }
    if (isUrl(source)) {
      insertArtifact(run.id, 'output', 'Media downloaded source', outputPath, contentType || undefined, { sourceType: 'url', bytes, downloadAttempts });
    }
    fs.writeFileSync(statePath, JSON.stringify({ ...state, source, outputPath, bytes, contentType, downloadAttempts }, null, 2), 'utf8');
    setExecutionSummary(run.id, { latestOutputPath: outputPath, bytes, contentType, downloadAttempts });
    return `已${isUrl(source) ? '下载' : '归档'}媒体源文件，大小 ${bytes} bytes`;
  }

  if (step.step_id === 'poll') {
    const live = safeJsonParse(fs.readFileSync(statePath, 'utf8'), {}) || {};
    if (!live.outputPath || !fileExists(live.outputPath)) throw new Error('media output missing before probe');
    const probe = runFfprobe(live.outputPath);
    const probePath = writeJsonFile(run, `${timestamp}-media-ffprobe.json`, probe, 'evidence', 'Media ffprobe');
    writeTextFile(run, `${timestamp}-media-poll.log`, `ffprobe ok\nformat=${probe.format?.format_name || 'unknown'}\n`, 'log', 'Media poll/probe log');
    fs.writeFileSync(statePath, JSON.stringify({ ...live, probePath, probe }, null, 2), 'utf8');
    setExecutionSummary(run.id, { latestOutputPath: probePath, mediaFormat: probe.format?.format_name || 'unknown' });
    return '已完成媒体探测并记录 ffprobe 结果';
  }

  if (step.step_id === 'download') {
    const live = safeJsonParse(fs.readFileSync(statePath, 'utf8'), {}) || {};
    if (!live.outputPath || !fileExists(live.outputPath)) throw new Error('media output missing before manifest');
    const manifest = {
      source,
      archivedPath: live.outputPath,
      bytes: fs.statSync(live.outputPath).size,
      contentType: live.contentType || null,
      downloadAttempts: live.downloadAttempts || 0,
      sha256: input.emitChecksums === false ? null : sha256File(live.outputPath),
      probeSummary: live.probe ? {
        formatName: live.probe.format?.format_name || null,
        duration: live.probe.format?.duration || null,
        bitRate: live.probe.format?.bit_rate || null,
        streams: Array.isArray(live.probe.streams) ? live.probe.streams.length : 0,
      } : null,
      builtAt: nowIso(),
    };
    const manifestPath = writeJsonFile(run, `${timestamp}-media-output-manifest.json`, manifest, 'output', 'Media output manifest');
    if (input.extractFrame !== false) {
      const previewPath = path.join(runDir, `${timestamp}-media-preview.jpg`);
      if (maybeExtractFrame(live.outputPath, previewPath)) {
        insertArtifact(run.id, 'evidence', 'Media preview frame', previewPath, 'image/jpeg', { from: path.basename(live.outputPath) });
      }
    }
    fs.writeFileSync(statePath, JSON.stringify({ ...live, manifestPath, manifest }, null, 2), 'utf8');
    setExecutionSummary(run.id, { latestOutputPath: manifestPath });
    return '已生成媒体 manifest，并尽可能抽取预览帧';
  }

  if (step.step_id === 'deliver') {
    const live = safeJsonParse(fs.readFileSync(statePath, 'utf8'), {}) || {};
    const replayPath = ensureZipReplay(run);
    const includeChecksum = input.emitChecksums !== false;
    let deliveryManifest = null;
    let deliveryReceiptPath = null;
    let webhookReceipt = null;

    if (input.deliveryDir) {
      if (!path.isAbsolute(String(input.deliveryDir))) {
        throw new Error('media deliveryDir 必须是绝对路径');
      }
      const destDir = String(input.deliveryDir);
      ensureDir(destDir);
      const copied = [];
      [live.outputPath, live.manifestPath, replayPath].filter(Boolean).forEach((filePath) => {
        if (!fileExists(filePath)) return;
        const destPath = path.join(destDir, path.basename(filePath));
        fs.copyFileSync(filePath, destPath);
        copied.push(describeDeliveredFile(destPath, includeChecksum));
      });
      deliveryManifest = {
        deliveredAt: nowIso(),
        deliveryDir: destDir,
        copied,
      };
      deliveryReceiptPath = writeJsonFile(run, `${timestamp}-media-delivery-manifest.json`, deliveryManifest, 'output', 'Media delivery manifest');
      live.deliveryManifestPath = deliveryReceiptPath;
    }

    if (input.deliveryWebhookUrl) {
      const webhookUrl = String(input.deliveryWebhookUrl);
      if (!/^https?:\/\//i.test(webhookUrl)) {
        throw new Error('media deliveryWebhookUrl 必须是 http/https URL');
      }
      const payload = {
        runId: run.id,
        traceId: run.trace_id,
        source,
        emittedAt: nowIso(),
        replay: describeDeliveredFile(replayPath, includeChecksum),
        archivedSource: describeDeliveredFile(live.outputPath, includeChecksum),
        manifest: describeDeliveredFile(live.manifestPath, includeChecksum),
        localDelivery: deliveryManifest,
      };
      const response = await postJson(webhookUrl, payload, normalizeHeaderMap(input.deliveryWebhookHeaders) || {}, {
        retries: Number(input.deliveryWebhookRetries || 0),
        backoffMs: Number(input.deliveryWebhookBackoffMs || 600),
      });
      webhookReceipt = {
        deliveredAt: nowIso(),
        webhookUrl,
        status: response.status,
        ok: response.ok,
        attempts: response.attempts,
        responseBody: response.body,
      };
      const webhookReceiptPath = writeJsonFile(run, `${timestamp}-media-webhook-receipt.json`, webhookReceipt, 'output', 'Media webhook receipt');
      live.webhookReceiptPath = webhookReceiptPath;
      if (!response.ok) {
        throw new Error(`media webhook delivery failed: ${response.status}`);
      }
    }

    const deliveryLog = writeTextFile(run, `${timestamp}-media-delivery.log`, [
      'media delivery summary',
      `source=${source}`,
      `replay=${replayPath}`,
      `deliveryDir=${input.deliveryDir || 'not-configured'}`,
      `deliveryWebhookUrl=${input.deliveryWebhookUrl || 'not-configured'}`,
      `artifacts=${getRunArtifacts(run.id).length}`,
      deliveryManifest ? `copied=${deliveryManifest.copied.length}` : 'copied=0',
      webhookReceipt ? `webhookStatus=${webhookReceipt.status}` : 'webhookStatus=not-configured',
      webhookReceipt ? `webhookAttempts=${webhookReceipt.attempts}` : 'webhookAttempts=0',
      deliveryManifest ? '已完成本地投递落地。' : '未配置 deliveryDir，本次未做本地目录投递。',
      webhookReceipt ? '已完成 webhook 外发。' : '未配置 webhook，本次只保留本地产物与 replay。',
    ].join('\n'), 'log', 'Media delivery log');
    fs.writeFileSync(statePath, JSON.stringify({ ...live, replayPath, deliveryManifest, webhookReceipt }, null, 2), 'utf8');
    setExecutionSummary(run.id, {
      replayPath,
      latestLogPath: deliveryLog,
      deliveryDir: input.deliveryDir || null,
      deliveryWebhookUrl: input.deliveryWebhookUrl || null,
      realArtifactsCount: countRealArtifacts(run.id),
      lastArtifactLabels: recentArtifactLabels(run.id),
    });
    if (deliveryManifest && webhookReceipt) return '已生成媒体 replay 包，并完成本地目录投递 + webhook 外发';
    if (deliveryManifest) return '已生成媒体 replay 包并完成本地交付目录投递';
    if (webhookReceipt) return '已生成媒体 replay 包并完成 webhook 外发';
    return '已生成媒体 replay 包和交付日志';
  }

  return 'media step skipped';
}

function getFactoryStatePath(run) {
  return path.join(getRunDir(run.id), 'factory-state.json');
}

function listFilesRecursive(dir, limit = 80) {
  const found = [];
  const queue = [dir];
  while (queue.length > 0 && found.length < limit) {
    const current = queue.shift();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
      } else if (entry.isFile()) {
        found.push(fullPath);
      }
      if (found.length >= limit) break;
    }
  }
  return found;
}

function normalizeSeverity(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (['P0', 'CRITICAL', 'BLOCKER', 'HIGH-RISK'].includes(raw)) return 'P0';
  if (['P1', 'HIGH', 'MAJOR'].includes(raw)) return 'P1';
  if (['P3', 'LOW', 'MINOR'].includes(raw)) return 'P3';
  return 'P2';
}

function severityScore(value) {
  const severity = normalizeSeverity(value);
  if (severity === 'P0') return 100;
  if (severity === 'P1') return 75;
  if (severity === 'P3') return 20;
  return 45;
}

function normalizeChecklist(checklist) {
  if (!Array.isArray(checklist)) return [];
  return checklist.map((item, index) => {
    if (typeof item === 'string') {
      return { id: `C${index + 1}`, title: item, status: 'observe' };
    }
    return {
      id: item.id || `C${index + 1}`,
      title: item.title || item.name || `检查项 ${index + 1}`,
      status: item.status || item.result || 'observe',
      note: item.note || item.comment || null,
    };
  });
}

function inferStandardMatch(finding, standards, target) {
  const explicitCode = String(finding.standardCode || finding.standard || '').trim();
  if (explicitCode) {
    const exact = standards.find((item) => item.code === explicitCode);
    if (exact) return exact;
  }

  const text = `${finding.title || ''} ${finding.currentState || ''} ${finding.risk || ''} ${target || ''}`.toLowerCase();
  const keywordRules = [
    { code: 'ESD-GROUND', keywords: ['esd', '静电', '手环', '接地'] },
    { code: '5S-HOUSEKEEPING', keywords: ['5s', '整理', '标识', '通道'] },
    { code: 'SAFE-GUARD', keywords: ['防护', '安全', '护栏', '警示'] },
    { code: 'PM-CHECK', keywords: ['点检', '保养', '设备', '维护'] },
  ];
  const matched = keywordRules.find((rule) => rule.keywords.some((keyword) => text.includes(keyword)));
  if (matched) {
    const standard = standards.find((item) => item.code === matched.code);
    if (standard) return standard;
  }
  return standards[0] || null;
}

function getDefaultFactoryStandards() {
  return [
    { code: 'ESD-GROUND', clause: '接地与人体防静电', requirement: '人员接触敏感器件前，应完成手环/接地/台垫接地确认。', kpi: 'ESD 风险 = 0' },
    { code: '5S-HOUSEKEEPING', clause: '现场整顿与标识', requirement: '通道、工位、物料区必须标识清晰、无混放、无堵塞。', kpi: '巡检问题 24h 闭环' },
    { code: 'SAFE-GUARD', clause: '安全防护', requirement: '危险点需具备防护装置、警示和隔离措施。', kpi: '重大安全隐患 0 容忍' },
    { code: 'PM-CHECK', clause: '设备点检与保养', requirement: '关键设备需有点检记录、责任人和周期策略。', kpi: '关键设备可用率达标' },
  ];
}

function normalizeFindings(findings, ownerFallback) {
  if (!Array.isArray(findings)) return [];
  return findings.map((item, index) => ({
    id: item.id || `F${String(index + 1).padStart(2, '0')}`,
    title: item.title || item.issue || `问题 ${index + 1}`,
    severity: normalizeSeverity(item.severity),
    currentState: item.currentState || item.observation || item.note || null,
    risk: item.risk || null,
    recommendation: item.recommendation || item.action || '补充责任人、整改动作和复核时间。',
    owner: item.owner || ownerFallback || null,
    dueDate: item.dueDate || null,
    effort: item.effort || 'medium',
    evidence: item.evidence || item.evidenceRef || null,
    standardCode: item.standardCode || item.standard || null,
  }));
}

function escapeCsv(value) {
  const raw = String(value == null ? '' : value);
  if (/[,"\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

function getFileMimeType(filePath) {
  const result = spawnSync('file', ['--mime-type', '-b', filePath], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0) return null;
  return String(result.stdout || '').trim() || null;
}

function getImageMetadata(filePath) {
  const script = [
    'import json, sys',
    'from PIL import Image',
    'img = Image.open(sys.argv[1])',
    'print(json.dumps({"width": img.width, "height": img.height, "mode": img.mode, "format": img.format}))',
  ].join('\n');
  const result = spawnSync('python3', ['-c', script, filePath], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0) return null;
  return safeJsonParse(result.stdout, null);
}

function summarizeEvidenceMedia(filePath) {
  try {
    const probe = runFfprobe(filePath);
    return {
      formatName: probe.format?.format_name || null,
      duration: probe.format?.duration || null,
      streams: Array.isArray(probe.streams) ? probe.streams.length : 0,
    };
  } catch {
    return null;
  }
}

function inspectFactoryEvidence(filePath) {
  const mimeType = getFileMimeType(filePath);
  const stats = fs.statSync(filePath);
  const inspection = {
    mimeType,
    extension: path.extname(filePath).slice(1).toLowerCase() || null,
    bytes: stats.size,
    sha256: sha256File(filePath),
  };
  if (mimeType && mimeType.startsWith('image/')) {
    inspection.image = getImageMetadata(filePath);
  } else if (mimeType && (mimeType.startsWith('video/') || mimeType.startsWith('audio/'))) {
    inspection.media = summarizeEvidenceMedia(filePath);
  }
  return inspection;
}

async function analyzeFactoryEvidenceWithVision(run, evidenceItem, input) {
  if (!input?.visionWebhookUrl) return null;
  const webhookUrl = String(input.visionWebhookUrl || '');
  if (!/^https?:\/\//i.test(webhookUrl)) {
    throw new Error('factory visionWebhookUrl 必须是 http/https URL');
  }
  const payload = {
    runId: run.id,
    traceId: run.trace_id,
    evidenceId: evidenceItem.id,
    fileName: evidenceItem.fileName,
    mimeType: evidenceItem.mimeType,
    sha256: evidenceItem.sha256,
    image: evidenceItem.image || null,
    base64: fs.readFileSync(evidenceItem.copiedPath).toString('base64'),
  };
  const response = await postJson(webhookUrl, payload, normalizeHeaderMap(input.visionWebhookHeaders) || {}, {
    retries: Number(input.visionWebhookRetries || 0),
    backoffMs: Number(input.visionWebhookBackoffMs || 500),
  });
  if (!response.ok) {
    throw new Error(`factory vision webhook failed: ${response.status}`);
  }
  return {
    provider: 'vision-webhook',
    status: response.status,
    attempts: response.attempts,
    body: response.body,
  };
}

async function analyzeFactoryBatchWithVision(run, evidenceIndex, input) {
  if (!input?.visionBatchWebhookUrl) return null;
  const webhookUrl = String(input.visionBatchWebhookUrl || '');
  if (!/^https?:\/\//i.test(webhookUrl)) {
    throw new Error('factory visionBatchWebhookUrl 必须是 http/https URL');
  }
  const maxImages = Math.max(2, Math.min(12, Number(input.visionBatchMaxImages || 6)));
  const imageEvidence = evidenceIndex
    .filter((item) => item && typeof item === 'object' && String(item.mimeType || '').startsWith('image/'))
    .slice(0, maxImages);
  if (imageEvidence.length < 2) return null;
  const payload = {
    runId: run.id,
    traceId: run.trace_id,
    evidenceCount: imageEvidence.length,
    items: imageEvidence.map((item) => ({
      evidenceId: item.id,
      fileName: item.fileName,
      mimeType: item.mimeType,
      sha256: item.sha256,
      image: item.image || null,
      summary: item.vision?.body?.summary || null,
      base64: fs.readFileSync(item.copiedPath).toString('base64'),
    })),
  };
  const response = await postJson(webhookUrl, payload, normalizeHeaderMap(input.visionBatchWebhookHeaders) || {}, {
    retries: Number(input.visionBatchWebhookRetries || 0),
    backoffMs: Number(input.visionBatchWebhookBackoffMs || 700),
  });
  if (!response.ok) {
    throw new Error(`factory vision batch webhook failed: ${response.status}`);
  }
  return {
    provider: 'vision-batch-webhook',
    status: response.status,
    attempts: response.attempts,
    imagesCount: imageEvidence.length,
    body: response.body,
  };
}

function isEmbeddableEvidenceImage(item) {
  return Boolean(item && item.copiedPath && ['image/png', 'image/jpeg'].includes(item.mimeType || item.inspection?.mimeType || ''));
}

async function writeFactoryPptx(run, payload) {
  const PptxGenJS = require('pptxgenjs');
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'Operator Studio';
  pptx.company = 'Operator Studio';
  pptx.subject = payload.title;
  pptx.title = payload.title;
  pptx.lang = 'zh-CN';
  pptx.theme = {
    headFontFace: 'Microsoft YaHei',
    bodyFontFace: 'Microsoft YaHei',
    lang: 'zh-CN',
  };

  const titleSlide = pptx.addSlide();
  titleSlide.background = { color: 'F8FAFC' };
  titleSlide.addText(payload.title, { x: 0.6, y: 0.5, w: 11.5, h: 0.7, fontSize: 26, bold: true, color: '0F172A' });
  titleSlide.addText([
    { text: `Site: ${payload.site}` },
    { text: `\nLine: ${payload.lineName}` },
    { text: `\nAudit Date: ${payload.auditDate}` },
    { text: `\nOwner: ${payload.owner || '未指定'}` },
    { text: `\nEvidence: ${payload.evidenceIndex.length}` },
    { text: `\nFindings: ${payload.prioritized.length}` },
    { text: `\nMulti-Vision: ${payload.visionBatch?.summary ? 'Enabled' : 'Off'}` },
  ], { x: 0.8, y: 1.6, w: 5.6, h: 2.6, fontSize: 16, color: '334155', breakLine: false });
  titleSlide.addText('Operator Studio 自动导出审计汇报版', { x: 0.8, y: 5.9, w: 6, h: 0.4, fontSize: 14, color: '475569' });

  const summarySlide = pptx.addSlide();
  summarySlide.addText('整改优先级', { x: 0.6, y: 0.4, w: 4, h: 0.5, fontSize: 22, bold: true, color: '0F172A' });
  const priorityRows = [
    [
      { text: '#', options: { bold: true, color: 'FFFFFF', fill: '0F172A' } },
      { text: '问题', options: { bold: true, color: 'FFFFFF', fill: '0F172A' } },
      { text: '等级', options: { bold: true, color: 'FFFFFF', fill: '0F172A' } },
      { text: '标准', options: { bold: true, color: 'FFFFFF', fill: '0F172A' } },
      { text: '责任人', options: { bold: true, color: 'FFFFFF', fill: '0F172A' } },
      { text: '时限', options: { bold: true, color: 'FFFFFF', fill: '0F172A' } },
    ],
    ...payload.prioritized.slice(0, 8).map((item) => [
      String(item.sequence),
      item.title,
      item.severity,
      item.standardCode || '',
      item.owner || '待定',
      item.dueWindow || '',
    ]),
  ];
  summarySlide.addTable(priorityRows, {
    x: 0.5,
    y: 1.1,
    w: 12.2,
    rowH: 0.38,
    fontSize: 11,
    border: { type: 'solid', color: 'CBD5E1', pt: 1 },
    color: '0F172A',
    fill: 'FFFFFF',
  });

  if (payload.visionBatch?.summary || (Array.isArray(payload.visionBatch?.findings) && payload.visionBatch.findings.length > 0)) {
    const visionSlide = pptx.addSlide();
    visionSlide.addText('多图联合理解', { x: 0.6, y: 0.4, w: 4, h: 0.5, fontSize: 22, bold: true, color: '0F172A' });
    visionSlide.addText(payload.visionBatch?.summary || '未返回联合摘要', { x: 0.7, y: 1.2, w: 11.3, h: 1.2, fontSize: 18, color: '1E293B' });
    const detailLines = [];
    if (Array.isArray(payload.visionBatch?.comparisons) && payload.visionBatch.comparisons.length > 0) {
      detailLines.push('对比结论：');
      payload.visionBatch.comparisons.slice(0, 4).forEach((item, index) => {
        detailLines.push(`${index + 1}. ${item}`);
      });
      detailLines.push('');
    }
    if (Array.isArray(payload.visionBatch?.findings) && payload.visionBatch.findings.length > 0) {
      detailLines.push('跨图问题：');
      payload.visionBatch.findings.slice(0, 5).forEach((item, index) => {
        detailLines.push(`${index + 1}. [${item.severity || 'P2'}] ${item.title}`);
      });
    }
    visionSlide.addText(detailLines.join('\n') || '未返回联合问题点。', { x: 0.8, y: 2.3, w: 11.1, h: 3.5, fontSize: 15, color: '334155' });
  }

  const evidenceSlide = pptx.addSlide();
  evidenceSlide.addText('证据清单', { x: 0.6, y: 0.4, w: 4, h: 0.5, fontSize: 22, bold: true, color: '0F172A' });
  const evidenceRows = [
    [
      { text: 'ID', options: { bold: true, color: 'FFFFFF', fill: '0F172A' } },
      { text: '文件', options: { bold: true, color: 'FFFFFF', fill: '0F172A' } },
      { text: '类型', options: { bold: true, color: 'FFFFFF', fill: '0F172A' } },
      { text: '大小', options: { bold: true, color: 'FFFFFF', fill: '0F172A' } },
      { text: '补充信息', options: { bold: true, color: 'FFFFFF', fill: '0F172A' } },
    ],
    ...payload.evidenceIndex.slice(0, 10).map((item) => [
      item.id,
      item.fileName,
      item.mimeType || 'unknown',
      String(item.bytes),
      item.vision?.body?.summary || (item.image ? `${item.image.width}x${item.image.height}` : item.media ? `${item.media.formatName || 'media'} / ${item.media.duration || '-'}s` : '-'),
    ]),
  ];
  evidenceSlide.addTable(evidenceRows, {
    x: 0.5,
    y: 1.1,
    w: 12.2,
    rowH: 0.38,
    fontSize: 11,
    border: { type: 'solid', color: 'CBD5E1', pt: 1 },
    color: '0F172A',
    fill: 'FFFFFF',
  });

  payload.evidenceIndex.filter(isEmbeddableEvidenceImage).slice(0, 3).forEach((item) => {
    const slide = pptx.addSlide();
    slide.addText(`${item.id} · ${item.fileName}`, { x: 0.6, y: 0.4, w: 8, h: 0.5, fontSize: 22, bold: true, color: '0F172A' });
    slide.addImage({ path: item.copiedPath, x: 0.6, y: 1.2, w: 7.2, h: 4.6 });
    slide.addText([
      { text: `类型: ${item.mimeType || 'unknown'}` },
      { text: `\n大小: ${item.bytes} bytes` },
      { text: item.image ? `\n尺寸: ${item.image.width} x ${item.image.height}` : '' },
      { text: item.sha256 ? `\nSHA256: ${String(item.sha256).slice(0, 16)}...` : '' },
      { text: item.vision?.body?.summary ? `\n视觉摘要: ${item.vision.body.summary}` : '' },
    ], { x: 8.2, y: 1.4, w: 4.2, h: 3.6, fontSize: 14, color: '334155' });
  });

  const filePath = path.join(getRunDir(run.id), `${Date.now()}-factory-report.pptx`);
  await pptx.writeFile({ fileName: filePath });
  insertArtifact(run.id, 'output', 'Factory report pptx', filePath, 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
  return filePath;
}

async function executeFactoryStep(run, step, input) {
  const timestamp = Date.now();
  const statePath = getFactoryStatePath(run);
  const state = readStateFile(statePath, {});
  const site = String(input.site || run.target || 'Factory Audit');
  const title = String(input.auditTitle || `${site} 审计闭环`);
  const owner = input.owner ? String(input.owner) : null;

  if (step.step_id === 'collect') {
    const evidenceCandidates = [];
    if (input.evidenceDir) {
      const evidenceDir = String(input.evidenceDir);
      if (!path.isAbsolute(evidenceDir)) throw new Error('factory evidenceDir 必须是绝对路径');
      if (!fileExists(evidenceDir)) throw new Error(`factory evidenceDir not found: ${evidenceDir}`);
      evidenceCandidates.push(...listFilesRecursive(evidenceDir, 60));
    }
    if (Array.isArray(input.evidenceFiles)) {
      input.evidenceFiles.forEach((item) => {
        if (typeof item === 'string' && item.trim()) evidenceCandidates.push(item.trim());
      });
    }
    const evidenceFiles = [...new Set(evidenceCandidates)]
      .filter((filePath) => path.isAbsolute(filePath) && fileExists(filePath))
      .slice(0, 60);

    const evidenceIndex = await Promise.all(evidenceFiles.map(async (filePath, index) => {
      const inspection = inspectFactoryEvidence(filePath);
      const copiedPath = copyFileToRun(run, filePath, `factory-evidence-${index + 1}-${path.basename(filePath)}`, 'evidence', `现场证据 ${index + 1}: ${path.basename(filePath)}`, { sourcePath: filePath, mimeType: inspection.mimeType, sha256: inspection.sha256 });
      const evidenceItem = {
        id: `E${String(index + 1).padStart(2, '0')}`,
        sourcePath: filePath,
        copiedPath,
        fileName: path.basename(filePath),
        bytes: inspection.bytes,
        mimeType: inspection.mimeType,
        sha256: inspection.sha256,
        image: inspection.image || null,
        media: inspection.media || null,
      };
      const vision = inspection.mimeType && inspection.mimeType.startsWith('image/')
        ? await analyzeFactoryEvidenceWithVision(run, evidenceItem, input)
        : null;
      return {
        ...evidenceItem,
        vision,
      };
    }));

    const autoFindings = evidenceIndex.flatMap((item) => {
      const findingsFromVision = item.vision?.body?.findings;
      if (!Array.isArray(findingsFromVision)) return [];
      return findingsFromVision.map((finding, index) => ({
        id: finding.id || `${item.id}-V${index + 1}`,
        title: finding.title || finding.issue || `${item.fileName} 自动识别问题 ${index + 1}`,
        severity: finding.severity || 'P2',
        currentState: finding.currentState || finding.observation || item.vision?.body?.summary || null,
        risk: finding.risk || null,
        recommendation: finding.recommendation || '请结合现场人工复核并补充整改动作。',
        owner: finding.owner || owner || null,
        dueDate: finding.dueDate || null,
        effort: finding.effort || 'medium',
        evidence: item.id,
        standardCode: finding.standardCode || null,
      }));
    });

    const visionBatch = await analyzeFactoryBatchWithVision(run, evidenceIndex, input);
    const batchFindings = Array.isArray(visionBatch?.body?.findings)
      ? visionBatch.body.findings.map((finding, index) => ({
        id: finding.id || `BATCH-V${index + 1}`,
        title: finding.title || finding.issue || `多图联合识别问题 ${index + 1}`,
        severity: finding.severity || 'P2',
        currentState: finding.currentState || finding.observation || visionBatch?.body?.summary || null,
        risk: finding.risk || null,
        recommendation: finding.recommendation || '请结合跨图结论安排现场复核与整改。',
        owner: finding.owner || owner || null,
        dueDate: finding.dueDate || null,
        effort: finding.effort || 'medium',
        evidence: Array.isArray(finding.evidenceIds) ? finding.evidenceIds.join(', ') : finding.evidence || null,
        standardCode: finding.standardCode || null,
      }))
      : [];

    const checklist = normalizeChecklist(input.checklist);
    const findings = normalizeFindings([...(Array.isArray(input.findings) ? input.findings : []), ...autoFindings, ...batchFindings], owner);
    const payload = {
      runId: run.id,
      traceId: run.trace_id,
      title,
      site,
      lineName: input.lineName || site,
      auditDate: input.auditDate || nowIso().slice(0, 10),
      owner,
      evidenceCount: evidenceIndex.length,
      visionCount: evidenceIndex.filter((item) => item.vision).length,
      visionBatch: visionBatch ? {
        provider: visionBatch.provider,
        status: visionBatch.status,
        attempts: visionBatch.attempts,
        imagesCount: visionBatch.imagesCount,
        summary: visionBatch.body?.summary || null,
        comparisons: Array.isArray(visionBatch.body?.comparisons) ? visionBatch.body.comparisons : [],
        findings: batchFindings,
      } : null,
      checklist,
      findings,
      collectedAt: nowIso(),
    };
    const indexPath = writeJsonFile(run, `${timestamp}-factory-evidence-index.json`, payload, 'evidence', 'Factory evidence index');
    const briefPath = writeTextFile(run, `${timestamp}-factory-brief.md`, [
      `# ${title}`,
      '',
      `- site: ${site}`,
      `- lineName: ${input.lineName || site}`,
      `- auditDate: ${payload.auditDate}`,
      `- owner: ${owner || '未指定'}`,
      `- evidenceCount: ${evidenceIndex.length}`,
      `- visionCount: ${payload.visionCount}`,
      `- visionBatch: ${payload.visionBatch ? `${payload.visionBatch.imagesCount} images` : 'off'}`,
      `- findingsCount: ${findings.length}`,
      `- checklistCount: ${checklist.length}`,
      '',
      '## 初步结论',
      findings.length > 0 ? findings.map((item) => `- [${item.severity}] ${item.title}`).join('\n') : '- 当前未给出显式 findings，本次先完成证据归档与审计骨架。',
      '',
      '## 证据元数据',
      evidenceIndex.length > 0 ? evidenceIndex.slice(0, 8).map((item) => `- ${item.id}: ${item.fileName} / ${item.mimeType || 'unknown'} / ${item.image ? `${item.image.width}x${item.image.height}` : item.media ? `${item.media.formatName || 'media'} / ${item.media.duration || '-'}s` : '-'} `).join('\n') : '- 无',
      '',
      '## 图片理解摘要',
      evidenceIndex.some((item) => item.vision?.body?.summary)
        ? evidenceIndex.filter((item) => item.vision?.body?.summary).map((item) => `- ${item.id}: ${item.vision.body.summary}`).join('\n')
        : '- 未配置 vision provider 或本次未返回摘要',
      '',
      '## 多图联合理解',
      payload.visionBatch?.summary || '- 未配置 visionBatchWebhookUrl 或当前图片不足两张',
      ...(Array.isArray(payload.visionBatch?.comparisons) && payload.visionBatch.comparisons.length > 0
        ? ['', '### 对比结论', ...payload.visionBatch.comparisons.map((item) => `- ${item}`)]
        : []),
    ].join('\n'), 'evidence', 'Factory audit brief', 'text/markdown');
    writeStateFile(statePath, { ...state, site, title, owner, evidenceIndex, checklist, findings, visionBatch: payload.visionBatch, collectIndexPath: indexPath, briefPath });
    setExecutionSummary(run.id, { latestOutputPath: indexPath, evidenceCount: evidenceIndex.length, findingsCount: findings.length, visionBatch: payload.visionBatch?.summary || null });
    return `已归档 ${evidenceIndex.length} 份现场证据，形成审计输入基线`;
  }

  if (step.step_id === 'map') {
    const live = readStateFile(statePath, {});
    const standards = (Array.isArray(input.standards) && input.standards.length > 0 ? input.standards : getDefaultFactoryStandards()).map((item) => ({
      code: String(item.code || item.id || 'STD'),
      clause: item.clause || item.name || null,
      requirement: item.requirement || item.requirementText || '需满足现场标准要求。',
      kpi: item.kpi || item.metric || null,
    }));
    const mappedFindings = (live.findings || []).map((finding) => {
      const standard = inferStandardMatch(finding, standards, run.target);
      return {
        ...finding,
        standardCode: standard ? standard.code : finding.standardCode || 'UNMAPPED',
        standardClause: standard ? standard.clause : null,
        requirement: standard ? standard.requirement : finding.requirement || null,
        kpi: standard ? standard.kpi : null,
      };
    });
    const mapping = {
      title: live.title || title,
      standards,
      mappedFindings,
      mappedAt: nowIso(),
    };
    const mapPath = writeJsonFile(run, `${timestamp}-factory-standards-map.json`, mapping, 'output', 'Factory standards map');
    const controlsPath = writeTextFile(run, `${timestamp}-factory-controls.md`, [
      '# Standards Mapping',
      '',
      ...mappedFindings.map((item) => [
        `## ${item.id} · ${item.title}`,
        `- severity: ${item.severity}`,
        `- standard: ${item.standardCode || 'UNMAPPED'} ${item.standardClause ? `(${item.standardClause})` : ''}`,
        `- requirement: ${item.requirement || '未提供'}`,
        `- recommendation: ${item.recommendation}`,
        `- owner: ${item.owner || '未指定'}`,
      ].join('\n')),
    ].join('\n\n'), 'output', 'Factory controls mapping', 'text/markdown');
    writeStateFile(statePath, { ...live, standards, mappedFindings, mapPath, controlsPath });
    setExecutionSummary(run.id, { latestOutputPath: mapPath, mappedFindings: mappedFindings.length });
    return `已完成 ${mappedFindings.length} 个问题点的标准映射`;
  }

  if (step.step_id === 'prioritize') {
    const live = readStateFile(statePath, {});
    const prioritized = (live.mappedFindings || []).map((item, index) => {
      const score = severityScore(item.severity) + Math.max(0, 20 - index);
      const dueWindow = item.severity === 'P0' ? '24h' : item.severity === 'P1' ? '3d' : item.severity === 'P2' ? '7d' : '14d';
      return {
        ...item,
        priorityScore: score,
        dueWindow,
        sequence: 0,
      };
    }).sort((a, b) => b.priorityScore - a.priorityScore).map((item, index) => ({ ...item, sequence: index + 1 }));

    const csv = [
      ['sequence', 'id', 'title', 'severity', 'standardCode', 'owner', 'dueWindow', 'recommendation'],
      ...prioritized.map((item) => [item.sequence, item.id, item.title, item.severity, item.standardCode || '', item.owner || '', item.dueWindow, item.recommendation]),
    ].map((row) => row.map(escapeCsv).join(',')).join('\n');

    const priorityPath = writeJsonFile(run, `${timestamp}-factory-priority.json`, { generatedAt: nowIso(), prioritized }, 'output', 'Factory priority plan');
    const csvPath = writeTextFile(run, `${timestamp}-factory-priority.csv`, csv, 'output', 'Factory priority CSV', 'text/csv');
    writeStateFile(statePath, { ...live, prioritized, priorityPath, csvPath });
    setExecutionSummary(run.id, { latestOutputPath: priorityPath, priorityCount: prioritized.length });
    return prioritized.length > 0 ? `已输出整改优先级排序，共 ${prioritized.length} 项` : '当前无显式 findings，已生成空优先级计划';
  }

  if (step.step_id === 'export') {
    const live = readStateFile(statePath, {});
    const prioritized = live.prioritized || [];
    const evidenceIndex = live.evidenceIndex || [];
    const reportPayload = {
      title: live.title || title,
      site: live.site || site,
      lineName: input.lineName || live.lineName || site,
      auditDate: input.auditDate || nowIso().slice(0, 10),
      owner: live.owner || owner || '未指定',
      prioritized,
      evidenceIndex,
      visionBatch: live.visionBatch || null,
    };
    const markdown = [
      `# ${reportPayload.title}`,
      '',
      `- site: ${reportPayload.site}`,
      `- auditDate: ${reportPayload.auditDate}`,
      `- owner: ${reportPayload.owner}`,
      `- evidenceCount: ${evidenceIndex.length}`,
      `- findingsCount: ${prioritized.length}`,
      '',
      '## 总结',
      prioritized.length > 0 ? `本次共识别 ${prioritized.length} 个问题点，建议按优先级顺序闭环。` : '本次未录入显式问题点，先保留证据索引与审计骨架。',
      '',
      '## 整改优先级',
      prioritized.length > 0 ? prioritized.map((item) => `1. [${item.severity}] ${item.title} / ${item.standardCode || 'UNMAPPED'} / owner=${item.owner || '待定'} / due=${item.dueWindow}`).join('\n') : '- 无',
      '',
      '## 多图联合理解',
      reportPayload.visionBatch?.summary || '- 未启用',
      ...(Array.isArray(reportPayload.visionBatch?.comparisons) && reportPayload.visionBatch.comparisons.length > 0
        ? ['', ...reportPayload.visionBatch.comparisons.map((item) => `- ${item}`)]
        : []),
      '',
      '## 证据索引',
      evidenceIndex.length > 0 ? evidenceIndex.map((item) => `- ${item.id}: ${item.fileName} (${item.bytes} bytes) / ${item.mimeType || 'unknown'}${item.image ? ` / ${item.image.width}x${item.image.height}` : ''}${item.vision?.body?.summary ? ` / 视觉摘要: ${item.vision.body.summary}` : ''}`).join('\n') : '- 无',
    ].join('\n');
    const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/><title>${reportPayload.title}</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f8fafc;color:#0f172a;padding:32px;line-height:1.7}h1,h2{margin:0 0 12px}section{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:20px;margin:16px 0}table{width:100%;border-collapse:collapse}th,td{padding:10px;border-bottom:1px solid #e2e8f0;text-align:left} .p0{color:#b91c1c;font-weight:700}.p1{color:#c2410c;font-weight:700}.p2{color:#1d4ed8;font-weight:700}.p3{color:#475569;font-weight:700}</style></head><body><h1>${reportPayload.title}</h1><section><div>site: ${reportPayload.site}</div><div>auditDate: ${reportPayload.auditDate}</div><div>owner: ${reportPayload.owner}</div><div>evidenceCount: ${evidenceIndex.length}</div></section><section><h2>整改优先级</h2><table><thead><tr><th>#</th><th>问题</th><th>等级</th><th>标准</th><th>责任人</th><th>建议时限</th></tr></thead><tbody>${prioritized.map((item) => `<tr><td>${item.sequence}</td><td>${item.title}</td><td class="${String(item.severity || '').toLowerCase()}">${item.severity}</td><td>${item.standardCode || ''}</td><td>${item.owner || ''}</td><td>${item.dueWindow || ''}</td></tr>`).join('')}</tbody></table></section><section><h2>多图联合理解</h2><div>${reportPayload.visionBatch?.summary || '未启用'}</div>${Array.isArray(reportPayload.visionBatch?.comparisons) && reportPayload.visionBatch.comparisons.length > 0 ? `<ul>${reportPayload.visionBatch.comparisons.map((item) => `<li>${item}</li>`).join('')}</ul>` : ''}</section><section><h2>证据索引</h2><ul>${evidenceIndex.map((item) => `<li>${item.id}: ${item.fileName} (${item.bytes} bytes) / ${item.mimeType || 'unknown'}${item.image ? ` / ${item.image.width}x${item.image.height}` : ''}${item.vision?.body?.summary ? ` / 视觉摘要: ${item.vision.body.summary}` : ''}</li>`).join('')}</ul></section></body></html>`;
    const markdownPath = writeTextFile(run, `${timestamp}-factory-report.md`, markdown, 'output', 'Factory report markdown', 'text/markdown');
    const htmlPath = writeTextFile(run, `${timestamp}-factory-report.html`, html, 'output', 'Factory report html', 'text/html');
    let pptxPath = null;
    if (input.exportPptx !== false) {
      pptxPath = await writeFactoryPptx(run, reportPayload);
    }
    let exportManifest = null;
    if (input.exportDir) {
      const exportDir = String(input.exportDir);
      if (!path.isAbsolute(exportDir)) throw new Error('factory exportDir 必须是绝对路径');
      ensureDir(exportDir);
      const copied = [markdownPath, htmlPath, live.csvPath, pptxPath].filter(Boolean).filter((filePath) => fileExists(filePath)).map((filePath) => {
        const destPath = path.join(exportDir, path.basename(filePath));
        fs.copyFileSync(filePath, destPath);
        return destPath;
      });
      exportManifest = { exportDir, copied, exportedAt: nowIso() };
      writeJsonFile(run, `${timestamp}-factory-export-manifest.json`, exportManifest, 'output', 'Factory export manifest');
    }
    writeStateFile(statePath, { ...live, markdownPath, htmlPath, pptxPath, exportManifest });
    setExecutionSummary(run.id, { latestOutputPath: pptxPath || htmlPath, exportDir: input.exportDir || null, pptxPath });
    if (exportManifest && pptxPath) return '已导出审计报告 HTML/Markdown/PPTX，并同步到指定目录';
    if (pptxPath) return '已导出审计报告 HTML/Markdown/PPTX';
    return exportManifest ? '已导出审计报告并同步到指定目录' : '已导出审计报告 HTML/Markdown';
  }

  if (step.step_id === 'review') {
    const live = readStateFile(statePath, {});
    const replayPath = ensureZipReplay(run);
    const review = {
      title: live.title || title,
      evidenceCount: Array.isArray(live.evidenceIndex) ? live.evidenceIndex.length : 0,
      findingsCount: Array.isArray(live.prioritized) ? live.prioritized.length : 0,
      hasVisionBatch: Boolean(live.visionBatch && live.visionBatch.summary),
      hasPriorityCsv: Boolean(live.csvPath && fileExists(live.csvPath)),
      hasMarkdown: Boolean(live.markdownPath && fileExists(live.markdownPath)),
      hasHtml: Boolean(live.htmlPath && fileExists(live.htmlPath)),
      hasPptx: Boolean(live.pptxPath && fileExists(live.pptxPath)),
      hasReplay: Boolean(replayPath && fileExists(replayPath)),
      reviewedAt: nowIso(),
    };
    const reviewPath = writeJsonFile(run, `${timestamp}-factory-review.json`, review, 'evidence', 'Factory review report');
    const reviewMdPath = writeTextFile(run, `${timestamp}-factory-review.md`, [
      '# Factory review',
      '',
      `- title: ${review.title}`,
      `- evidenceCount: ${review.evidenceCount}`,
      `- findingsCount: ${review.findingsCount}`,
      `- hasVisionBatch: ${review.hasVisionBatch}`,
      `- hasPriorityCsv: ${review.hasPriorityCsv}`,
      `- hasMarkdown: ${review.hasMarkdown}`,
      `- hasHtml: ${review.hasHtml}`,
      `- hasPptx: ${review.hasPptx}`,
      `- hasReplay: ${review.hasReplay}`,
      `- replayPath: ${replayPath}`,
      '',
      '结论：审计包结构完整，可用于继续复核、汇报或外部传递。',
    ].join('\n'), 'evidence', 'Factory review markdown', 'text/markdown');
    writeStateFile(statePath, { ...live, reviewPath, reviewMdPath, replayPath });
    setExecutionSummary(run.id, { latestOutputPath: reviewPath, replayPath, findingsCount: review.findingsCount, evidenceCount: review.evidenceCount, hasVisionBatch: review.hasVisionBatch });
    return '已完成 factory audit 审计包复核并生成 replay';
  }

  return 'factory step skipped';
}

async function executeSimulatedStep(run, step) {
  const content = [
    `# Simulated Evidence: ${step.title}`,
    '',
    `- run: ${run.title}`,
    `- traceId: ${run.trace_id}`,
    `- stepIndex: ${step.step_index + 1}`,
    `- executor: ${run.executor_type}`,
    `- finishedAt: ${nowIso()}`,
    '',
    'This step still uses simulated execution.',
  ].join('\n');
  writeTextFile(run, `${Date.now()}-${step.step_id}-simulated.md`, content, 'evidence', `${step.title} simulated evidence`, 'text/markdown');
  return '当前步骤仍为模拟执行';
}

async function executeStep(run, step) {
  const input = safeJsonParse(run.execution_input_json, {}) || {};
  if (run.executor_type === 'browser-playwright') {
    return executeBrowserStep(run, step, input);
  }
  if (run.executor_type === 'media-pipeline') {
    return executeMediaStep(run, step, input);
  }
  if (run.executor_type === 'factory-audit-pipeline') {
    return executeFactoryStep(run, step, input);
  }
  return executeSimulatedStep(run, step, input);
}

async function processRun(run) {
  if (run.desired_state === 'stopped' && run.status !== 'stopped') {
    stopRun(run);
    return;
  }

  if (run.status === 'queued') {
    startRun(run);
    run = row(db.prepare('SELECT * FROM runs WHERE id = ?').get(run.id));
  }

  const steps = listSteps(run.id);
  let runningStep = getRunningStep(steps);
  if (!runningStep) {
    const nextStep = getPendingStep(steps);
    if (!nextStep) {
      const replayPath = ensureZipReplay(run);
      const summary = setExecutionSummary(run.id, {
        replayPath,
        completedAt: nowIso(),
        realArtifactsCount: countRealArtifacts(run.id),
        lastArtifactLabels: recentArtifactLabels(run.id),
      });
      updateRunStatus(run.id, {
        status: 'completed',
        progress_percent: 100,
        updated_at: nowIso(),
        completed_at: nowIso(),
        current_step_index: Math.max(0, steps.length - 1),
        live_summary: 'Run completed',
        execution_summary_json: summary,
      });
      insertEvent(run.id, 'info', 'run_completed', 'Run completed successfully');
      return;
    }
    markStepRunning(run, nextStep);
    return;
  }

  try {
    const note = await executeStep(run, runningStep);
    markStepCompleted(run, runningStep, note);
  } catch (error) {
    failRun(run, runningStep, error);
  }
}

function loop() {
  Promise.resolve().then(async () => {
    heartbeat();
    const governance = getGovernance();
    const runs = listActiveRuns();
    const runningCount = runs.filter((run) => run.status === 'running').length;
    const queuedRuns = runs.filter((run) => run.status === 'queued');
    const runnableQueued = queuedRuns.slice(0, Math.max(0, governance.maxConcurrentRuns - runningCount));
    const candidates = [...runs.filter((run) => run.status === 'running'), ...runnableQueued];
    for (const candidate of candidates) {
      await processRun(candidate);
    }
  }).catch((error) => {
    log('worker loop failed', { error: String(error) });
  }).finally(() => {
    setTimeout(loop, getGovernance().workerPollIntervalMs);
  });
}

log('worker boot', { dbPath, workerName, chromiumPath, playwrightCorePath });
heartbeat();
loop();
