import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { seedSwitchCatalog } from '../src/gacha/switch-catalog.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

try {
  await seedSwitchCatalog(prisma);
  console.log('switch catalog seeded');
} finally {
  await prisma.$disconnect();
}
