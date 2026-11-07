
import express from "express";
import cors from "cors";
import { prisma } from "../../../services/database/src/db.js";
import { previewReconciliation } from "../../../services/database/src/reconciliation-preview.js";
import { askFinFlowAI } from "./ai-assistant.js";


const app = express();

app.disable("x-powered-by");

app.use(
  cors({
    origin: "http://localhost:5173",
  })
);

app.use(express.json({ limit: "1mb" }));

// Basic API health check.
app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "finflow-api",
  });
});

// Database readiness check.
app.get("/health/ready", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    res.status(200).json({
      status: "ready",
      service: "finflow-api",
      database: "connected",
    });
  } catch (error) {
    console.error("Database readiness check failed:", error);

    res.status(503).json({
      status: "not_ready",
      service: "finflow-api",
      database: "disconnected",
    });
  }
});

// Retrieve invoices belonging to a workspace.
app.get("/api/workspaces/:workspaceId/invoices", async (req, res) => {
  try {
    const { workspaceId } = req.params;

    if (!workspaceId) {
      res.status(400).json({
        error: "Workspace ID is required.",
      });
      return;
    }

    const workspace = await prisma.workspace.findUnique({
      where: {
        id: workspaceId,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!workspace) {
      res.status(404).json({
        error: "Workspace not found.",
      });
      return;
    }

    const invoices = await prisma.invoice.findMany({
      where: {
        workspaceId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.status(200).json({
      workspace,
      count: invoices.length,
      invoices,
    });
  } catch (error) {
    console.error("Failed to retrieve invoices:", error);

    res.status(500).json({
      error: "Failed to retrieve invoices.",
    });
  }
});


 // Retrieve bank transactions belonging to a workspace.
app.get("/api/workspaces/:workspaceId/transactions", async (req, res) => {
  try {
    const { workspaceId } = req.params;

    if (!workspaceId) {
      res.status(400).json({
        error: "Workspace ID is required.",
      });
      return;
    }

    const workspace = await prisma.workspace.findUnique({
      where: {
        id: workspaceId,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!workspace) {
      res.status(404).json({
        error: "Workspace not found.",
      });
      return;
    }

    const transactions = await prisma.bankTransaction.findMany({
      where: {
        workspaceId,
      },
      orderBy: {
        transactionDate: "desc",
      },
      select: {
        id: true,
        bankAccountId: true,
        statementImportId: true,
        sourceRow: true,
        externalReference: true,
        description: true,
        normalizedDescription: true,
        transactionDate: true,
        amount: true,
        currency: true,
        direction: true,
        createdAt: true,
      },
    });

    res.status(200).json({
      workspace,
      count: transactions.length,
      transactions,
    });
  } catch (error) {
    console.error("Failed to retrieve transactions:", error);

    res.status(500).json({
      error: "Failed to retrieve transactions.",
    });
  }
});

app.get
(
  "/api/workspaces/:workspaceId/exceptions",
  async (req, res) => {
    try {
      const { workspaceId } = req.params;

      const exceptions =
        await prisma.reconciliationException.findMany({
          where: {
            workspaceId,
          },
          orderBy: {
            createdAt: "desc",
          },
          include: {
            transaction: {
              select: {
                id: true,
                description: true,
                amount: true,
                currency: true,
                transactionDate: true,
              },
            },
            invoice: {
              select: {
                id: true,
                vendorNameSnapshot: true,
                amount: true,
                currency: true,
                status: true,
              },
            },
            run: {
              select: {
                id: true,
                status: true,
                startedAt: true,
              },
            },
          },
        });

      res.status(200).json({
        count: exceptions.length,
        exceptions,
      });
    } catch (error) {
      console.error("Failed to fetch exceptions:", error);

      res.status(500).json({
        error: "Failed to fetch reconciliation exceptions.",
      });
    }
  },
);

app.post(
  "/api/workspaces/:workspaceId/exceptions/:exceptionId/resolve",
  async (req, res) => {
    try {
      const { workspaceId, exceptionId } = req.params;
      const { resolutionNote } = req.body;

      if (
        typeof resolutionNote !== "string" ||
        resolutionNote.trim().length < 5 ||
        resolutionNote.trim().length > 500
      ) {
        res.status(400).json({
          error: "Resolution note must be between 5 and 500 characters.",
        });
        return;
      }

      const exception = await prisma.reconciliationException.findFirst({
        where: {
          id: exceptionId,
          workspaceId,
        },
      });

      if (!exception) {
        res.status(404).json({
          error: "Exception not found.",
        });
        return;
      }

      if (
        exception.status === "RESOLVED" ||
        exception.status === "IGNORED"
      ) {
        res.status(409).json({
          error: "Exception is already closed.",
        });
        return;
      }

      const result = await prisma.$transaction(async (tx) => {
        const updatedException =
          await tx.reconciliationException.update({
            where: {
              id: exceptionId,
            },
            data: {
              status: "RESOLVED",
              resolutionNote: resolutionNote.trim(),
              resolvedAt: new Date(),
            },
          });

        await tx.auditLog.create({
          data: {
            workspaceId,
            action: "EXCEPTION_RESOLVED",
            entityType: "ReconciliationException",
            entityId: exceptionId,
            details: {
              resolutionNote: resolutionNote.trim(),
              previousStatus: exception.status,
              newStatus: "RESOLVED",
            },
          },
        });

        return updatedException;
      });

      res.status(200).json({
        message: "Exception resolved successfully.",
        exception: result,
      });
    } catch (error) {
      console.error("Failed to resolve exception:", error);

      res.status(500).json({
        error: "Failed to resolve exception.",
      });
    }
  },
);



// Persist a reconciliation run, proposed allocations, exceptions, and audit event.
app.post(
  "/api/workspaces/:workspaceId/reconciliation/runs",
  async (req, res) => {
    try {
      const { workspaceId } = req.params;

      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { id: true, name: true },
      });

      if (!workspace) {
        res.status(404).json({ error: "Workspace not found." });
        return;
      }

      // Reuse the same matching logic as the read-only preview.
      const preview = await previewReconciliation(workspaceId);
      const proposedTransactionIds = preview.allocations.map(
        (item) => item.transactionId,
      );

      // Existing allocations should not block the entire reconciliation run.
      // Filter them out and persist only proposals for unallocated transactions.
      // The database's unique transactionId constraint remains a final safeguard.
      const existingAllocations =
        proposedTransactionIds.length > 0
          ? await prisma.paymentAllocation.findMany({
              where: {
                workspaceId,
                transactionId: { in: proposedTransactionIds },
              },
              select: { transactionId: true },
            })
          : [];

      const alreadyAllocatedTransactionIds = new Set(
        existingAllocations.map((item) => item.transactionId),
      );

      const eligibleAllocations = preview.allocations.filter(
        (item) => !alreadyAllocatedTransactionIds.has(item.transactionId),
      );

      if (eligibleAllocations.length === 0) {
        res.status(409).json({
          error:
            "There are no new allocations to reconcile. All proposed transactions already have allocations.",
          alreadyAllocatedTransactionIds: [
            ...alreadyAllocatedTransactionIds,
          ],
        });
        return;
      }

      const savedRun = await prisma.$transaction(async (tx) => {
        const run = await tx.reconciliationRun.create({
          data: {
            workspaceId,
            status: "RUNNING",
          },
        });

        for (const item of eligibleAllocations) {
          await tx.paymentAllocation.create({
            data: {
              workspaceId,
              invoiceId: item.invoiceId,
              transactionId: item.transactionId,
              runId: run.id,
              amount: item.amount.toFixed(4),
              currency: item.currency,
              status: "PROPOSED",
            },
          });
        }

        for (const duplicate of preview.duplicateCandidates) {
          await tx.reconciliationException.create({
            data: {
              workspaceId,
              runId: run.id,
              transactionId: duplicate.duplicateTransactionId,
              type: "POSSIBLE_DUPLICATE",
              status: "OPEN",
              reason: duplicate.reason,
            },
          });
        }

        for (const exception of preview.exceptions) {
          const exceptionType =
            exception.type === "UNMATCHED"
              ? "UNMATCHED_TRANSACTION"
              : exception.type === "AMBIGUOUS"
                ? "AMBIGUOUS_MATCH"
                : "INVALID_TRANSACTION";

          await tx.reconciliationException.create({
            data: {
              workspaceId,
              runId: run.id,
              transactionId: exception.transactionId,
              type: exceptionType,
              status: "OPEN",
              reason:
                exception.reason +
                (exception.candidateInvoiceIds.length > 0
                  ? ` Candidate invoices: ${exception.candidateInvoiceIds.join(", ")}`
                  : ""),
            },
          });
        }

        const completedRun = await tx.reconciliationRun.update({
          where: { id: run.id },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
          },
        });

        await tx.auditLog.create({
          data: {
            workspaceId,
            action: "RECONCILIATION_RUN_COMPLETED",
            entityType: "ReconciliationRun",
            entityId: run.id,
            details: {
              invoiceCount: preview.summary.invoicesLoaded,
              transactionCount: preview.summary.transactionsLoaded,
              duplicateCount: preview.duplicateCandidates.length,
              proposedAllocationCount: eligibleAllocations.length,
              skippedAlreadyAllocatedCount: alreadyAllocatedTransactionIds.size,
              exceptionCount:
                preview.duplicateCandidates.length + preview.exceptions.length,
            },
          },
        });

        return completedRun;
      });

      res.status(201).json({
        message: "Reconciliation run completed. Allocations await review.",
        run: savedRun,
        summary: {
          ...preview.summary,
          proposedAllocations: eligibleAllocations.length,
        },
        skippedAlreadyAllocatedCount: alreadyAllocatedTransactionIds.size,
        alreadyAllocatedTransactionIds: [
          ...alreadyAllocatedTransactionIds,
        ],
        allocationsRequireApproval: true,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "Workspace not found.") {
        res.status(404).json({ error: "Workspace not found." });
        return;
      }

      if (error instanceof Error && error.message === "Demo bank account not found.") {
        res.status(404).json({ error: "Demo bank account not found." });
        return;
      }

      console.error("Failed to run reconciliation:", error);
      res.status(500).json({ error: "Failed to run reconciliation." });
    }
  },
);

// Retrieve audit history for a workspace.
app.get(
  "/api/workspaces/:workspaceId/audit-logs",
  async (req, res) => {
    try {
      const { workspaceId } = req.params;
      const requestedLimit = Number(req.query.limit ?? 50);

      if (
        !Number.isInteger(requestedLimit) ||
        requestedLimit < 1 ||
        requestedLimit > 100
      ) {
        res.status(400).json({
          error: "Limit must be an integer between 1 and 100.",
        });
        return;
      }

      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { id: true, name: true },
      });

      if (!workspace) {
        res.status(404).json({ error: "Workspace not found." });
        return;
      }

      const auditLogs = await prisma.auditLog.findMany({
        where: { workspaceId },
        orderBy: { createdAt: "desc" },
        take: requestedLimit,
        include: {
          actor: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      res.status(200).json({
        workspace,
        count: auditLogs.length,
        auditLogs,
      });
    } catch (error) {
      console.error("Failed to retrieve audit logs:", error);
      res.status(500).json({ error: "Failed to retrieve audit logs." });
    }
  },
);


// Preview reconciliation without modifying the database.
app.get(
  "/api/workspaces/:workspaceId/reconciliation/preview",
  async (req, res) => {
    try {
      const { workspaceId } = req.params;

      if (!workspaceId) {
        res.status(400).json({
          error: "Workspace ID is required.",
        });
        return;
      }

      const result = await previewReconciliation(workspaceId);

      res.status(200).json({
        status: "preview_completed",
        readOnly: true,
        ...result,
      });
    } catch (error) {
      console.error("Reconciliation preview failed:", error);

      if (
        error instanceof Error &&
        error.message === "Workspace not found."
      ) {
        res.status(404).json({
          error: "Workspace not found.",
        });
        return;
      }

      res.status(500).json({
        error: "Failed to preview reconciliation.",
      });
    }
  },
);

 // Retrieve proposed and processed allocations belonging to a workspace.
app.get(
  "/api/workspaces/:workspaceId/allocations",
  async (req, res) => {
    try {
      const { workspaceId } = req.params;

      if (!workspaceId) {
        res.status(400).json({
          error: "Workspace ID is required.",
        });
        return;
      }

      const workspace = await prisma.workspace.findUnique({
        where: {
          id: workspaceId,
        },
        select: {
          id: true,
          name: true,
        },
      });

      if (!workspace) {
        res.status(404).json({
          error: "Workspace not found.",
        });
        return;
      }

      const allocations = await prisma.paymentAllocation.findMany({
        where: {
          workspaceId,
        },
        orderBy: {
          allocatedAt: "desc",
        },
        include: {
          invoice: {
            select: {
              invoiceNumber: true,
              vendorNameSnapshot: true,
              amount: true,
              currency: true,
              status: true,
            },
          },
          transaction: {
            select: {
              externalReference: true,
              description: true,
              transactionDate: true,
              amount: true,
              currency: true,
            },
          },
        },
      });

      res.status(200).json({
        workspace,
        count: allocations.length,
        allocations,
      });
    } catch (error) {
      console.error("Failed to retrieve allocations:", error);

      res.status(500).json({
        error: "Failed to retrieve allocations.",
      });
    }
  },
);

 // Approve a proposed payment allocation.
app.post(
  "/api/workspaces/:workspaceId/allocations/:allocationId/approve",
  async (req, res) => {
    try {
      const { workspaceId, allocationId } = req.params;

      const result = await prisma.$transaction(async (tx) => {
        const allocation = await tx.paymentAllocation.findFirst({
          where: {
            id: allocationId,
            workspaceId,
          },
          include: {
            invoice: true,
          },
        });

        if (!allocation) {
          throw new Error("ALLOCATION_NOT_FOUND");
        }

        if (allocation.status !== "PROPOSED") {
          throw new Error("ALLOCATION_NOT_PROPOSED");
        }

        if (allocation.currency !== allocation.invoice.currency) {
          throw new Error("CURRENCY_MISMATCH");
        }

        const approvedAllocations = await tx.paymentAllocation.aggregate({
          where: {
            invoiceId: allocation.invoiceId,
            status: "APPROVED",
          },
          _sum: {
            amount: true,
          },
        });

        const alreadyPaid =
  approvedAllocations._sum.amount?.toNumber() ?? 0;

        const outstanding =
  allocation.invoice.amount.toNumber() -
  alreadyPaid;

        if (allocation.amount.toNumber() > outstanding) {
          throw new Error("OVERPAYMENT");
        }

        const approved = await tx.paymentAllocation.update({
          where: {
            id: allocation.id,
          },
          data: {
            status: "APPROVED",
            approvedAt: new Date(),
          },
        });

        const totalPaid =
  alreadyPaid +
  allocation.amount.toNumber();

        const invoiceStatus =
          totalPaid >= allocation.invoice.amount.toNumber()
            ? "PAID"
            : "PARTIALLY_PAID";

        await tx.invoice.update({
          where: {
            id: allocation.invoiceId,
          },
          data: {
            status: invoiceStatus,
          },
        });

        await tx.auditLog.create({
          data: {
            workspaceId,
            action: "PAYMENT_ALLOCATION_APPROVED",
            entityType: "PaymentAllocation",
            entityId: allocation.id,
            details: {
              invoiceId: allocation.invoiceId,
              transactionId: allocation.transactionId,
              amount: allocation.amount.toString(),
              currency: allocation.currency,
            },
          },
        });

        return {
          allocation: approved,
          invoiceStatus,
          totalPaid,
        };
      });

      res.status(200).json({
        message: "Allocation approved successfully.",
        ...result,
      });
    } catch (error) {
      if (error instanceof Error) {
        const errors: Record<string, number> = {
          ALLOCATION_NOT_FOUND: 404,
          ALLOCATION_NOT_PROPOSED: 409,
          CURRENCY_MISMATCH: 400,
          OVERPAYMENT: 409,
        };

        const statusCode = errors[error.message];

        if (statusCode) {
          res.status(statusCode).json({
            error: error.message,
          });
          return;
        }
      }

      console.error("Failed to approve allocation:", error);

      res.status(500).json({
        error: "Failed to approve allocation.",
      });
    }
  },
);
// Reject a proposed payment allocation.
app.post(
  "/api/workspaces/:workspaceId/allocations/:allocationId/reject",
  async (req, res) => {
    try {
      const { workspaceId, allocationId } = req.params;
      const reason = req.body?.reason;

      // Validate rejection reason.
      if (
        typeof reason !== "string" ||
        reason.trim().length < 5 ||
        reason.trim().length > 500
      ) {
        res.status(400).json({
          error: "Rejection reason must be between 5 and 500 characters.",
        });
        return;
      }

      const result = await prisma.$transaction(async (tx) => {
        const allocation = await tx.paymentAllocation.findFirst({
          where: {
            id: allocationId,
            workspaceId,
          },
        });

        if (!allocation) {
          throw new Error("ALLOCATION_NOT_FOUND");
        }

        if (allocation.status !== "PROPOSED") {
          throw new Error("ALLOCATION_NOT_PROPOSED");
        }

        const rejected = await tx.paymentAllocation.update({
          where: {
            id: allocation.id,
          },
          data: {
            status: "REJECTED",
          },
        });

        await tx.auditLog.create({
          data: {
            workspaceId,
            action: "PAYMENT_ALLOCATION_REJECTED",
            entityType: "PaymentAllocation",
            entityId: allocation.id,
            details: {
              invoiceId: allocation.invoiceId,
              transactionId: allocation.transactionId,
              amount: allocation.amount.toString(),
              currency: allocation.currency,
              reason: reason.trim(),
            },
          },
        });

        return rejected;
      });

      res.status(200).json({
        message: "Allocation rejected successfully.",
        allocation: result,
        rejectionReason: reason.trim(),
      });
    } catch (error) {
      if (error instanceof Error) {
        const errors: Record<string, number> = {
          ALLOCATION_NOT_FOUND: 404,
          ALLOCATION_NOT_PROPOSED: 409,
        };

        const statusCode = errors[error.message];

        if (statusCode) {
          res.status(statusCode).json({
            error: error.message,
          });
          return;
        }
      }

      console.error("Failed to reject allocation:", error);

      res.status(500).json({
        error: "Failed to reject allocation.",
      });
    }
  },
);

app.post("/api/workspaces/:workspaceId/assistant/chat", async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { question } = req.body;

    if (!workspaceId) {
      res.status(400).json({
        error: "Workspace ID is required.",
      });
      return;
    }

    if (typeof question !== "string" || !question.trim()) {
      res.status(400).json({
        error: "A valid question is required.",
      });
      return;
    }

    if (question.length > 2000) {
      res.status(400).json({
        error: "Question must be 2000 characters or fewer.",
      });
      return;
    }

    const answer = await askFinFlowAI(
      workspaceId,
      question.trim()
    );

    res.status(200).json({
      workspaceId,
      question: question.trim(),
      answer,
    });
  } catch (error) {
    console.error("FinFlow AI assistant error:", error);

    if (error instanceof Error && error.message === "Workspace not found.") {
      res.status(404).json({
        error: "Workspace not found.",
      });
      return;
    }

    res.status(500).json({
      error: "Failed to generate AI response.",
    });
  }
});



const port = Number(process.env.PORT ?? 4000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("Invalid PORT configuration.");
}

const server = app.listen(port, () => {
  console.log(`FinFlow API running at http://localhost:${port}`);
});

// Graceful shutdown.
function shutdown() {
  console.log("\nShutting down FinFlow API...");

  server.close(() => {
    void prisma.$disconnect().finally(() => {
      process.exit(0);
    });
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
