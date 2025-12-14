import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const names = ['Breakfast', 'Lunch', 'Dinner', 'Drinks'];
  for (const name of names) {
    await prisma.menuType.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log('Seed completed');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
