import { parseArgs } from 'node:util';
import { MEDIA_KINDS, type MediaKind } from '@redova/contracts';
import { createPrismaClient } from '@redova/db';
import { loadDotEnv, parseEnv } from '../config/env';
import { createMediaStorage } from '../media/create-media-storage';
import { pruneMedia } from '../media/prune-media';

/** `pnpm media:prune [--kind avatar|organizationLogo]... [--apply]` — dry run by default. */
const main = async (): Promise<void> => {
  const { values } = parseArgs({
    options: {
      apply: { type: 'boolean', default: false },
      kind: { type: 'string', multiple: true },
    },
  });
  const kinds = (values.kind?.length ? values.kind : MEDIA_KINDS) as MediaKind[];
  const unknown = kinds.filter((kind) => !MEDIA_KINDS.includes(kind));
  if (unknown.length) throw new Error(`Unknown media kind: ${unknown.join(', ')}`);
  loadDotEnv();
  const env = parseEnv(process.env);
  const prisma = createPrismaClient(env.DATABASE_URL);
  const storage = createMediaStorage(env);
  try {
    for (const kind of kinds) {
      const report = await pruneMedia(storage, prisma, kind, { apply: values.apply });
      console.log(JSON.stringify({ dryRun: !values.apply, ...report }));
    }
  } finally {
    storage.close?.();
    await prisma.$disconnect();
  }
};

if (require.main === module) {
  void main().catch((error: unknown) => {
    const detail =
      error instanceof Error && error.message.startsWith('Unknown') ? error.message : '';
    console.error(
      detail || 'Media cleanup failed. Verify database/storage configuration and connectivity.',
    );
    process.exitCode = 1;
  });
}
