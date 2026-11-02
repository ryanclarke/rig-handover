import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, Night, ReadNight, RunLine, RunStatus } from './types.js';

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES: readonly RunStatus[] = ['ok', 'retry', 'fail'];

function isStatus(value: unknown): value is RunStatus {
  return typeof value === 'string' && (STATUSES as readonly string[]).includes(value);
}

// The edge: one raw line in, a RunLine or null (a bad line) out.
function parseLine(raw: string): RunLine | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const { at, job, status, owner, error } = value as Record<string, unknown>;
  if (typeof at !== 'string' || typeof job !== 'string' || !isStatus(status)) return null;
  if (owner !== null && typeof owner !== 'string') return null;
  const line: RunLine = { at, job, status, owner };
  if (typeof error === 'string') line.error = error;
  return line;
}

function toRow(job: string, lines: RunLine[]): DigestRow {
  const first = lines[0]!;
  const last = lines[lines.length - 1]!;
  let lastError: string | null = null;
  for (const line of lines) if (line.error !== undefined) lastError = line.error;
  return {
    job,
    owner: last.owner,
    runs: lines.length,
    retries: lines.filter((l) => l.status === 'retry').length,
    fails: lines.filter((l) => l.status === 'fail').length,
    lastStatus: last.status,
    lastError,
    firstAt: first.at,
    lastAt: last.at,
  };
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!NIGHT.test(night)) return null;
  const file = join(runsDir, `${night}.jsonl`);
  if (!existsSync(file)) return null;

  const byJob = new Map<string, RunLine[]>();
  const counts: Record<RunStatus, number> = { ok: 0, retry: 0, fail: 0 };
  let badLines = 0;

  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    if (raw.trim() === '') continue;
    const line = parseLine(raw);
    if (line === null) {
      badLines += 1;
      continue;
    }
    counts[line.status] += 1;
    const lines = byJob.get(line.job);
    if (lines) lines.push(line);
    else byJob.set(line.job, [line]);
  }

  const rows = [...byJob.entries()]
    .map(([job, lines]) => toRow(job, lines))
    .sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));

  return { night, rows, badLines, counts };
};
