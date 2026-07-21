import { PrismaClient } from "../generated/prisma";
import { migrateGridLayouts } from "../src/server/grid-layout-migration";

const prisma = new PrismaClient();

try {
  const counts = await migrateGridLayouts(prisma);
  console.log(JSON.stringify(counts, null, 2));
} finally {
  await prisma.$disconnect();
}
