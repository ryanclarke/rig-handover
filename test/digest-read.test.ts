import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28')!;
  const row = (job: string) => night.rows.find((r) => r.job === job)!;

  it('reads 5 jobs, sorted, and counts the 1 bad line', () => {
    expect(night).not.toBeNull();
    expect(night.night).toBe('2026-10-28');
    expect(night.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(night.badLines).toBe(1);
  });

  it('keeps a row whose owner is null', () => {
    expect(row('digest/render').owner).toBeNull();
  });

  it('keeps the last error after a recovery', () => {
    expect(row('fixtures/refresh')).toMatchObject({
      runs: 4,
      retries: 3,
      fails: 0,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
  });

  it('counts fails', () => {
    expect(row('notes/backup')).toMatchObject({ fails: 1, lastStatus: 'fail', lastError: 'quota exceeded' });
  });

  it('counts parsed lines per status', () => {
    expect(night.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
  });
});

describe('readNight on a temp runs dir', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-read-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('returns null when the file is missing', () => {
    expect(readNight(dir, '2026-01-01')).toBeNull();
  });

  it('reads an empty file as nothing ran', () => {
    writeFileSync(join(dir, '2026-01-02.jsonl'), '');
    expect(readNight(dir, '2026-01-02')).toEqual({
      night: '2026-01-02',
      rows: [],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('returns null for a night that is not YYYY-MM-DD', () => {
    writeFileSync(join(dir, 'nope.jsonl'), '');
    expect(readNight(dir, 'nope')).toBeNull();
    expect(readNight(dir, '../2026-01-02')).toBeNull();
  });

  it('counts lines with missing or wrong fields as bad, skips blank lines', () => {
    writeFileSync(
      join(dir, '2026-01-03.jsonl'),
      [
        '{"at":"2026-01-03T01:00:00+01:00","job":"a","status":"ok","owner":"x"}',
        '',
        '{"at":"2026-01-03T01:00:00+01:00","job":"a","status":"done","owner":"x"}',
        '{"at":"2026-01-03T01:00:00+01:00","job":"a","status":"ok"}',
        '[1,2]',
        'null',
      ].join('\n'),
    );
    const night = readNight(dir, '2026-01-03')!;
    expect(night.rows).toHaveLength(1);
    expect(night.badLines).toBe(4);
  });
});
