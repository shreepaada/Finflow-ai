import { prisma } from "./db.js";

async function main() {
  const result = await prisma.$queryRaw<
    Array<{ database: string; user: string }>
  >`SELECT current_database() AS database, current_user AS user`;

  console.log("Database connection successful!");
  console.log(result);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });