import { neon } from '@neondatabase/serverless';
import { z } from 'zod';
import { backupSchema, type Backup } from '../shared/schemas.ts';

const runSchema = z.object({
  id: z.string().min(1).max(100),
  startedAt: z.iso.datetime(),
  type: z.string().max(200),
  count: z.number().int().nonnegative(),
  status: z.string().max(50),
});

export const workspaceStateSchema = backupSchema.extend({ runs: z.array(runSchema).max(5000).default([]) });
export type WorkspaceState = z.infer<typeof workspaceStateSchema>;

function database() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw Object.assign(new Error('Neon DATABASE_URL이 설정되지 않았습니다.'), { statusCode: 503 });
  return neon(url);
}

export async function checkDatabaseConnection() {
  if (!process.env.DATABASE_URL?.trim()) return false;
  try {
    const sql = database();
    await sql`SELECT 1 AS ok`;
    return true;
  } catch {
    return false;
  }
}

let schemaReady: Promise<void> | undefined;
async function ensureSchema() {
  schemaReady ||= (async () => {
    const sql = database();
    await sql`CREATE TABLE IF NOT EXISTS bcr_workspaces (
      owner_id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      revision BIGINT NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  })().catch((error) => {
    schemaReady = undefined;
    throw error;
  });
  await schemaReady;
}

export async function readWorkspace(ownerId: string): Promise<{ state: WorkspaceState; revision: number } | null> {
  await ensureSchema();
  const sql = database();
  const rows = await sql`SELECT data, revision FROM bcr_workspaces WHERE owner_id = ${ownerId} LIMIT 1`;
  if (!rows.length) return null;
  return { state: workspaceStateSchema.parse(rows[0].data), revision: Number(rows[0].revision) };
}

export async function writeWorkspace(ownerId: string, raw: unknown, expectedRevision?: number) {
  await ensureSchema();
  const state = workspaceStateSchema.parse(raw);
  const sql = database();
  if (expectedRevision !== undefined) {
    const rows = await sql`UPDATE bcr_workspaces
      SET data = ${JSON.stringify(state)}::jsonb, revision = revision + 1, updated_at = NOW()
      WHERE owner_id = ${ownerId} AND revision = ${expectedRevision}
      RETURNING revision`;
    if (!rows.length) throw Object.assign(new Error('다른 기기에서 데이터가 변경되었습니다. 새로고침 후 다시 시도해 주세요.'), { statusCode: 409 });
    return Number(rows[0].revision);
  }
  const rows = await sql`INSERT INTO bcr_workspaces (owner_id, data)
    VALUES (${ownerId}, ${JSON.stringify(state)}::jsonb)
    ON CONFLICT (owner_id) DO UPDATE SET data = EXCLUDED.data, revision = bcr_workspaces.revision + 1, updated_at = NOW()
    RETURNING revision`;
  return Number(rows[0].revision);
}

export function withoutRuns(state: WorkspaceState): Backup {
  const { runs: _runs, ...backup } = state;
  return backupSchema.parse(backup);
}
