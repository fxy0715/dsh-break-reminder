import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
export const inject = ['connection'];

export function apply(ctx, config = {}) {
  if (process.platform !== 'win32') {
    throw new Error('[dsh-break-reminder] This plugin requires a Windows desktop.');
  }
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('[dsh-break-reminder] config must be an object.');
  }
  const intervalMinutes = config.intervalMinutes === undefined ? 50 : config.intervalMinutes;
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 1440) {
    throw new Error('[dsh-break-reminder] intervalMinutes must be an integer from 1 to 1440.');
  }

  let disposed = false;
  let reported = false;
  let stderr = '';
  let reader;
  let child;
  let disposeRpc;
  let state = { phase: 'starting', remainingMilliseconds: null, visible: false };
  let updatedAt = 0;
  const snapshot = () => ({
    ...state,
    phase: state.phase === 'running' && Date.now() - updatedAt > 10000 ? 'unresponsive' : state.phase,
    intervalMinutes,
  });
  const reportFailure = (message) => {
    state = { phase: 'failed', remainingMilliseconds: null, visible: false };
    if (reported || disposed) return;
    reported = true;
    console.warn('[dsh-break-reminder] ' + message);
  };
  const stop = () => {
    if (disposed) return;
    state = { phase: 'stopped', remainingMilliseconds: null, visible: false };
    reader?.close();
    disposeRpc?.();
    if (child) {
      try { child.kill(); }
      catch (error) { reportFailure('Could not stop the reminder: ' + error.message); }
    }
    disposed = true;
  };

  try {
    // Exact Connection routes share the existing authenticated, owner-only /api transport.
    const method = 'dsh-break-reminder/status';
    disposeRpc = ctx.connection.fetch.register({
      path: '/api/' + method,
      methods: ['POST'], requestBody: 'buffered',
      async fetch(input) {
        let envelope;
        try { envelope = await input.json(); }
        catch { return new Response('Invalid JSON request.', { status: 400 }); }
        if (envelope?.type !== 'client-request' || typeof envelope.rpcId !== 'string' || envelope.method !== method) {
          return new Response('Invalid reminder request.', { status: 400 });
        }
        return Response.json({ type: 'server-response', rpcId: envelope.rpcId, result: { ok: true, value: snapshot() } }, {
          headers: { 'cache-control': 'no-store' },
        });
      },
    });
    child = spawn('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-STA',
      '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden',
      '-File', path.join(here, 'reminder.ps1'),
      '-ParentPid', String(process.pid),
      '-IntervalMinutes', String(intervalMinutes), '-Bridge',
    ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });

    const running = child;
    reader = createInterface({ input: running.stdout });
    reader.on('line', (line) => {
      if (disposed) return;
      try {
        const value = JSON.parse(line);
        if (!Number.isSafeInteger(value.remainingMilliseconds) || value.remainingMilliseconds < 0 ||
            value.remainingMilliseconds > intervalMinutes * 60000 || typeof value.visible !== 'boolean') {
          throw new Error('Invalid reminder status.');
        }
        state = { phase: 'running', remainingMilliseconds: value.remainingMilliseconds, visible: value.visible };
        updatedAt = Date.now();
      } catch (error) { reportFailure('Could not read reminder status: ' + error.message); }
    });
    running.stderr.setEncoding('utf8');
    running.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-4096); });
    running.on('error', (error) => {
      if (!disposed) reportFailure('Could not run the reminder: ' + error.message);
    });
    running.on('close', (code) => {
      child = null;
      reader.close();
      if (disposed) return;
      if (code !== null && code !== 0) {
        reportFailure('Reminder exited with code ' + code + (stderr.trim() ? ': ' + stderr.trim() : ''));
      } else {
        state = { phase: 'stopped', remainingMilliseconds: null, visible: false };
      }
    });
    if (typeof ctx.effect === 'function') ctx.effect(() => stop);
  } catch (error) {
    stop();
    throw error;
  }
  return stop;
}
