import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';

export type { Prisma } from './generated/prisma/client';
export { PrismaClient };

/** Creates a Prisma client backed by the `pg` driver adapter (Prisma 7). */
export const createPrismaClient = (connectionString: string): PrismaClient =>
  new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
