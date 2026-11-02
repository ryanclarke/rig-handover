import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

// Hono escapes text nodes ("didn't" becomes "didn&#39;t"). Decode so the assertions read the visible text.
const pageText = async (res: Response) =>
  (await res.text()).replaceAll('&#39;', "'").replaceAll('&amp;', '&').replaceAll('&quot;', '"');

let runsDir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  // 3 valid lines over 2 jobs (backup-db has owner null), then one truncated line.
  writeFileSync(
    join(runsDir, '2026-01-01.jsonl'),
    [
      '{"at":"2026-01-01T02:00:00+01:00","job":"sync-users","status":"ok","owner":"ana"}',
      '{"at":"2026-01-01T03:00:00+01:00","job":"backup-db","status":"fail","owner":null,"error":"connection refused"}',
      '{"at":"2026-01-01T04:00:00+01:00","job":"sync-users","status":"retry","owner":"ana","error":"timeout"}',
      '{"at":"2026-01-01T04:30:00+01:00","job":"sync-users","status":"ok","owner":"ana"',
      '',
    ].join('\n'),
  );
  writeFileSync(join(runsDir, '2026-01-02.jsonl'), '');
  app = createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  });
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

// Sorted by job; the file lists sync-users first, so a passing sort is visible.
const GOOD_JOBS = ['backup-db', 'sync-users'];

describe('GET /digest/:night', () => {
  it('renders 200 with each job name for a night with a file', async () => {
    const res = await app.request('/digest/2026-01-01');
    const html = await pageText(res);
    expect(res.status).toBe(200);
    for (const job of GOOD_JOBS) expect(html).toContain(job);
  });

  it('answers 404 for a night with no file', async () => {
    // Guard: an unmatched route also answers 404, so prove the route exists first.
    expect((await app.request('/digest/2026-01-01')).status).toBe(200);
    expect((await app.request('/digest/2026-01-03')).status).toBe(404);
  });

  it('renders "nothing ran" for an empty file', async () => {
    const res = await app.request('/digest/2026-01-02');
    expect(res.status).toBe(200);
    expect(await pageText(res)).toContain('nothing ran');
  });

  it('renders the good jobs and "didn\'t parse" for a file with a bad line', async () => {
    const res = await app.request('/digest/2026-01-01');
    const html = await pageText(res);
    expect(res.status).toBe(200);
    for (const job of GOOD_JOBS) expect(html).toContain(job);
    expect(html).toContain("didn't parse");
  });
});

describe('GET /api/digest/:night', () => {
  it('returns night, rows sorted by job, badLines and counts for a night with a bad line', async () => {
    const res = await app.request('/api/digest/2026-01-01');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(body.night).toBe('2026-01-01');
    expect(body.rows.map((r) => r.job)).toEqual(GOOD_JOBS);
    expect(body.rows[0]?.owner).toBeNull();
    expect(body.badLines).toBe(1);
    expect(body.counts).toEqual({ ok: 1, retry: 1, fail: 1 });
  });

  it('answers 404 for a night with no file', async () => {
    expect((await app.request('/api/digest/2026-01-01')).status).toBe(200);
    expect((await app.request('/api/digest/2026-01-03')).status).toBe(404);
  });

  it('returns no rows and no bad lines for an empty file', async () => {
    const res = await app.request('/api/digest/2026-01-02');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(body.rows).toEqual([]);
    expect(body.badLines).toBe(0);
  });
});

describe('page and JSON agree', () => {
  it('lists the job names in the page in the same order as the JSON rows', async () => {
    const html = await pageText(await app.request('/digest/2026-01-01'));
    const body = (await (await app.request('/api/digest/2026-01-01')).json()) as Night;
    const positions = body.rows.map((r) => html.indexOf(r.job));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});
