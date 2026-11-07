
import { prisma } from "./db.js";

async function main() {
  const testAllocationId =
    "62d75e7e-5d3c-4296-907c-17bbc3787e2d";

  const testTransactionId =
    "5e94afb6-ac02-4444-892f-4c503ead7384";

  // Verify the exact test allocation before deleting.
  const allocation = await prisma.paymentAllocation.findUnique({
    where: {
      id: testAllocationId,
    },
  });

  if (!allocation) {
    console.log("Test allocation not found. Nothing to delete.");
    return;
  }

  if (
    allocation.status !== "REJECTED" ||
    allocation.transactionId !== testTransactionId
  ) {
    throw new Error(
      "Safety check failed. Allocation does not match the expected test record.",
    );
  }

  // Delete only the verified temporary test allocation.
  const result = await prisma.paymentAllocation.deleteMany({
    where: {
      id: testAllocationId,
      status: "REJECTED",
      transactionId: testTransactionId,
    },
  });

  if (result.count === 1) {
    console.log("Temporary rejection test allocation deleted.");
  } else {
    console.log("No allocation was deleted.");
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
