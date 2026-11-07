
import { prisma } from "./db.js";

async function main() {
  const allocation = await prisma.paymentAllocation.create({
    data: {
      workspaceId: "83ea69d3-108a-4980-997b-ce7eb0724979",
      invoiceId: "03baa369-555d-4c40-9031-98b63f213f5c",
      transactionId: "5e94afb6-ac02-4444-892f-4c503ead7384",
      amount: 1000,
      currency: "INR",
      status: "PROPOSED",
      runId: null,
    },
  });

  console.log("Temporary test allocation created:");
  console.log("Allocation ID:", allocation.id);
  console.log("Status:", allocation.status);
  console.log("Amount:", allocation.amount.toString());
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
