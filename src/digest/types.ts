// Plan morning-digest § 1. The contract every part of § 2 starts against: commit this first.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl, after parsing.
export type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One row per job. Times are the log's own strings, offset kept (styleguide).
export type DigestRow = {
  job: string;
  owner: string | null; // from the job's last line; null renders as —
  runs: number; // lines for this job, any status
  retries: number; // lines with status retry
  fails: number; // lines with status fail
  lastStatus: RunStatus;
  lastError: string | null; // the most recent error this job logged, if any
  firstAt: string;
  lastAt: string;
};

export type Night = {
  night: string; // YYYY-MM-DD, the file name
  rows: DigestRow[]; // sorted by job; empty for an empty file ("nothing ran")
  badLines: number; // lines that didn't parse: counted, never thrown
  counts: Record<RunStatus, number>; // parsed lines per status, for the board
};

// null when runs/<night>.jsonl doesn't exist (or night isn't YYYY-MM-DD): routes answer 404.
// Implemented in src/digest/read.ts.
export type ReadNight = (runsDir: string, night: string) => Night | null;
