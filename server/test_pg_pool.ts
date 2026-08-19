import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const connectionString = 'postgresql://aagamjain@localhost:5432/quiz?schema=public';
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  try {
    const user = await prisma.user.findFirst();
    console.log(user);
  } catch (e) {
    console.error(e);
  }
}
main();
