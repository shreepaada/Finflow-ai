import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import "./App.css";

const API_URL = "http://localhost:4000";
const WORKSPACE_ID = "83ea69d3-108a-4980-997b-ce7eb0724979";
const BASE = `/api/workspaces/${WORKSPACE_ID}`;

function App() {
  const [activePage, setActivePage] = useState("Overview");

  const [exceptions, setExceptions] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [preview, setPreview] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [reconciliationRun, setReconciliationRun] = useState(null);
  const [runningReconciliation, setRunningReconciliation] = useState(false);

  const [loading, setLoading] = useState({});
  const [error, setError] = useState("");

  const [selected, setSelected] = useState(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const [resolving, setResolving] = useState(false);
  const [processingAllocation, setProcessingAllocation] = useState("");
  const [notice, setNotice] = useState("");

  // AI Assistant chat state
  const [assistantMessages, setAssistantMessages] = useState([
    {
      role: "assistant",
      content: "Hi! I’m FinFlow AI. Ask me about this workspace’s invoices, transactions, allocations, or reconciliation exceptions.",
    },
  ]);
  const [assistantQuestion, setAssistantQuestion] = useState("");
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantUseRag, setAssistantUseRag] = useState(false);
  const [assistantUseTools, setAssistantUseTools] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [documentFile, setDocumentFile] = useState(null);
  const [documentUploading, setDocumentUploading] = useState(false);
  const [documentMessage, setDocumentMessage] = useState("");
  const [exceptionInsight, setExceptionInsight] = useState("");
  const [exceptionInsightLoading, setExceptionInsightLoading] = useState(false);
  const [exceptionInsightError, setExceptionInsightError] = useState("");
 
  

  async function request(path) {
    const response = await fetch(`${API_URL}${path}`);

    if (!response.ok) {
      throw new Error(`Request failed (${response.status})`);
    }

    return response.json();
  }

  async function loadData(key, endpoint, setter, property) {
    try {
      setLoading((previous) => ({ ...previous, [key]: true }));
      setError("");

      const data = await request(`${BASE}${endpoint}`);
      setter(property ? data[property] ?? [] : data);
    } catch (err) {
      setError(err.message || `Failed to load ${key}.`);
    } finally {
      setLoading((previous) => ({ ...previous, [key]: false }));
    }
  }

  function loadExceptions() {
    return loadData("exceptions", "/exceptions", setExceptions, "exceptions");
  }

  function loadTransactions() {
    return loadData("transactions", "/transactions", setTransactions, "transactions");
  }

  function loadInvoices() {
    return loadData("invoices", "/invoices", setInvoices, "invoices");
  }

  function loadPreview() {
    return loadData(
      "preview",
      "/reconciliation/preview",
      setPreview
    );
  }

  function loadAllocations() {
    return loadData("allocations", "/allocations", setAllocations, "allocations");
  }

  async function loadReconciliationData() {
    await Promise.all([loadPreview(), loadAllocations()]);
  }

  async function handleAllocationAction(allocation, action) {
    if (!allocation || allocation.status !== "PROPOSED") return;

    let reason = "";
    if (action === "approve") {
      if (!window.confirm(`Approve ${formatAmount(allocation.amount, allocation.currency)} for invoice ${allocation.invoice?.invoiceNumber || allocation.invoiceId}?`)) return;
    } else {
      reason = window.prompt("Enter a rejection reason (at least 5 characters):", "");
      if (reason === null) return;
      if (reason.trim().length < 5) {
        setError("Please enter a rejection reason of at least 5 characters.");
        return;
      }
      if (!window.confirm("Reject this proposed allocation?")) return;
    }

    try {
      setProcessingAllocation(allocation.id);
      setError("");
      setNotice("");
      const response = await fetch(
        `${API_URL}${BASE}/allocations/${allocation.id}/${action}`,
        {
          method: "POST",
          headers: action === "reject" ? { "Content-Type": "application/json" } : undefined,
          body: action === "reject" ? JSON.stringify({ reason: reason.trim() }) : undefined,
        }
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || result.message || `Could not ${action} allocation (${response.status}).`);
      }

      setNotice(result.message || `Allocation ${action === "approve" ? "approved" : "rejected"} successfully.`);
      await Promise.all([loadAllocations(), loadInvoices(), loadAuditLogs()]);
    } catch (err) {
      setError(err.message || `Failed to ${action} allocation.`);
    } finally {
      setProcessingAllocation("");
    }
  }

  async function runReconciliation() {
    if (!preview || loading.preview || runningReconciliation) return;

    // The backend filters out transactions that already have allocations.
    // Do not block the entire run when the preview contains prior allocations.
    const confirmed = window.confirm(
      "Run reconciliation now? This will create a reconciliation run and save proposed allocations and exceptions. Proposed allocations will still require approval."
    );
    if (!confirmed) return;

    try {
      setRunningReconciliation(true);
      setError("");
      const response = await fetch(`${API_URL}${BASE}/reconciliation/runs`, {
        method: "POST",
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || result.message || `Reconciliation failed (${response.status}).`);
      }

      setReconciliationRun(result);
      await Promise.all([
        loadPreview(),
        loadAllocations(),
        loadExceptions(),
        loadAuditLogs(),
      ]);
    } catch (err) {
      setError(err.message || "Failed to run reconciliation.");
    } finally {
      setRunningReconciliation(false);
    }
  }

  async function loadAuditLogs() {
    try {
      setLoading((previous) => ({ ...previous, audit: true }));
      setError("");

      const data = await request(`${BASE}/audit-logs`);
      setAuditLogs(data.auditLogs ?? data.logs ?? data.entries ?? []);
    } catch {
      setAuditLogs([]);
      setError("Failed to load audit logs. Check that the API is running and the workspace endpoint is available.");
    } finally {
      setLoading((previous) => ({ ...previous, audit: false }));
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      loadExceptions();
      loadTransactions();
      loadInvoices();
      loadPreview();
      loadAllocations();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  function navigateTo(page) {
    setActivePage(page);
    setError("");

    switch (page) {
      case "Overview":
        loadExceptions();
        loadTransactions();
        loadInvoices();
        loadPreview();
        loadAllocations();
        break;
      case "Transactions":
        loadTransactions();
        break;
      case "Invoices":
        loadInvoices();
        break;
      case "Reconciliation":
        loadReconciliationData();
        break;
      case "Allocations":
        loadAllocations();
        loadInvoices();
        break;
      case "Exceptions":
        loadExceptions();
        break;
      case "Audit Log":
        loadAuditLogs();
        break;
      case "Documents":
        loadDocuments();
        break;
      default:
        break;
    }
  }

  async function requestExceptionInsight() {
    if (!selected?.id || exceptionInsightLoading) return;
    setExceptionInsight("");
    setExceptionInsightError("");
    setExceptionInsightLoading(true);
    try {
      const response = await fetch(`${API_URL}${BASE}/assistant/exception-insights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exceptionId: selected.id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `Insight request failed (${response.status}).`);
      setExceptionInsight(result.insight || "No insight returned.");
    } catch (err) {
      setExceptionInsightError(err.message || "Could not generate exception insight.");
    } finally {
      setExceptionInsightLoading(false);
    }
  }

  async function resolveException() {
    if (!selected || !resolutionNote.trim()) return;

    try {
      setResolving(true);
      setError("");

      const response = await fetch(
        `${API_URL}${BASE}/exceptions/${selected.id}/resolve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            resolutionNote: resolutionNote.trim(),
          }),
        }
      );

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "Failed to resolve exception.");
      }

      setSelected(null);
      setResolutionNote("");
      await Promise.all([loadExceptions(), loadAuditLogs()]);
    } catch (err) {
      setError(err.message || "Failed to resolve exception.");
    } finally {
      setResolving(false);
    }
  }

  function formatDate(date) {
    if (!date) return "—";

    return new Date(date).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  function formatAmount(amount, currency = "INR") {
    return Number(amount || 0).toLocaleString("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    });
  }

  function statusBadge(status) {
    const value = String(status || "UNKNOWN");

    return (
      <span className={`status-badge ${value.toLowerCase()}`}>
        {value.replaceAll("_", " ")}
      </span>
    );
  }

  function heading(eyebrow, title, description, refresh, isLoading) {
    return (
      <div className="page-heading">
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>

        {refresh && (
          <button
            className="refresh-button"
            onClick={refresh}
            disabled={isLoading}
          >
            {isLoading ? "Refreshing..." : "↻ Refresh"}
          </button>
        )}
      </div>
    );
  }

  function tableCard(title, description, count, children) {
    return (
      <div className="table-card">
        <div className="table-header">
          <div>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
          <span className="record-count">{count}</span>
        </div>
        {children}
      </div>
    );
  }

  const openExceptions = exceptions.filter(
    (item) => item.status === "OPEN"
  ).length;

  const resolvedExceptions = exceptions.filter(
    (item) => item.status === "RESOLVED"
  ).length;

  const totalInvoiceAmount = invoices.reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0
  );

  // Use approved allocations to calculate partial payments. A PAID invoice
  // remains fully paid even if it predates allocation tracking in this demo.
  const approvedAmountByInvoice = allocations
    .filter((item) => item.status === "APPROVED")
    .reduce((totals, item) => {
      const invoiceId = item.invoiceId;
      totals[invoiceId] = (totals[invoiceId] || 0) + Number(item.amount || 0);
      return totals;
    }, {});

  const invoicePaymentStats = invoices.map((invoice) => {
    const invoiceAmount = Number(invoice.amount || 0);
    const allocatedPaidAmount = Number(approvedAmountByInvoice[invoice.id] || 0);
    const paidAmount = invoice.status === "PAID"
      ? invoiceAmount
      : Math.min(invoiceAmount, allocatedPaidAmount);

    return {
      ...invoice,
      paidAmount,
      outstandingAmount: Math.max(0, invoiceAmount - paidAmount),
    };
  });

  const paidInvoiceAmount = invoicePaymentStats.reduce(
    (sum, invoice) => sum + invoice.paidAmount,
    0
  );

  const outstandingAmount = invoicePaymentStats.reduce(
    (sum, invoice) => sum + invoice.outstandingAmount,
    0
  );

  const fullyPaidInvoiceCount = invoices.filter(
    (invoice) => invoice.status === "PAID"
  ).length;
  const partiallyPaidInvoiceCount = invoices.filter(
    (invoice) => invoice.status === "PARTIALLY_PAID"
  ).length;
  const unpaidInvoiceCount = invoices.length - fullyPaidInvoiceCount - partiallyPaidInvoiceCount;
  const paymentCompletionRate = invoices.length
    ? (fullyPaidInvoiceCount / invoices.length) * 100
    : 0;

  const monthlyTransactionData = (() => {
    const monthly = {};

    transactions.forEach((transaction) => {
      if (!transaction.transactionDate) return;

      const date = new Date(transaction.transactionDate);
      if (Number.isNaN(date.getTime())) return;

      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      if (!monthly[key]) {
        monthly[key] = {
          month: date.toLocaleDateString("en-IN", { month: "short", year: "numeric" }),
          transactionCount: 0,
          transactionAmount: 0,
        };
      }

      monthly[key].transactionCount += 1;
      // Keep the value chart limited to INR to avoid adding unlike currencies.
      if (!transaction.currency || transaction.currency === "INR") {
        monthly[key].transactionAmount += Number(transaction.amount || 0);
      }
    });

    return Object.entries(monthly)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, values]) => values);
  })();

  function renderOverview() {
    return (
      <>
        {heading(
          "WORKSPACE",
          "Overview",
          "A snapshot of your workspace's financial activity.",
          () => navigateTo("Overview"),
          loading.preview
        )}

        {error && <div className="error-banner">{error}</div>}

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Total Invoices</div>
            <div className="stat-value">{invoices.length}</div>
            <div className="stat-caption">
              {formatAmount(totalInvoiceAmount)} total value
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Payment Completion</div>
            <div className="stat-value">{paymentCompletionRate.toFixed(1)}%</div>
            <div className="stat-caption">
              {fullyPaidInvoiceCount} of {invoices.length} invoices fully paid
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Paid Invoice Value</div>
            <div className="stat-value">
              {formatAmount(paidInvoiceAmount)}
            </div>
            <div className="stat-caption">Paid value, including approved partial allocations</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Outstanding Value</div>
            <div className="stat-value">
              {formatAmount(outstandingAmount)}
            </div>
            <div className="stat-caption">Remaining invoice balance after recorded payments</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Transactions</div>
            <div className="stat-value">{transactions.length}</div>
            <div className="stat-caption">Imported bank records</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Open Exceptions</div>
            <div className="stat-value">{openExceptions}</div>
            <div className="stat-caption">
              {resolvedExceptions} resolved
            </div>
          </div>
        </div>

        <div className="transaction-trends-grid">
          <div className="table-card transaction-chart-card">
            <div className="table-header">
              <div>
                <h2>Monthly Transaction Volume</h2>
                <p>Monthly transaction value (INR transactions only).</p>
              </div>
            </div>
            {monthlyTransactionData.length === 0 ? (
              <div className="empty-state">Transaction data will appear here once available.</div>
            ) : (
              <div className="transaction-chart">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={monthlyTransactionData} margin={{ top: 12, right: 12, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) => `₹${Number(value).toLocaleString("en-IN")}`}
                    />
                    <Tooltip
                      formatter={(value) => [formatAmount(value, "INR"), "Transaction value"]}
                    />
                    <Bar dataKey="transactionAmount" name="Transaction value" fill="#6366f1" radius={[5, 5, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="table-card transaction-chart-card">
            <div className="table-header">
              <div>
                <h2>Monthly Transaction Count</h2>
                <p>Number of bank transactions per month.</p>
              </div>
            </div>
            {monthlyTransactionData.length === 0 ? (
              <div className="empty-state">Transaction data will appear here once available.</div>
            ) : (
              <div className="transaction-chart">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={monthlyTransactionData} margin={{ top: 12, right: 12, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value) => [value, "Transactions"]} />
                    <Bar dataKey="transactionCount" name="Transactions" fill="#0d9488" radius={[5, 5, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        {tableCard(
          "Invoice Payment Breakdown",
          "Invoice counts by payment status.",
          `${invoices.length} invoices`,
          loading.invoices ? (
            <div className="empty-state">Loading invoice breakdown...</div>
          ) : (
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-label">Paid</div>
                <div className="stat-value">{fullyPaidInvoiceCount}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Partially Paid</div>
                <div className="stat-value">{partiallyPaidInvoiceCount}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Outstanding</div>
                <div className="stat-value">{unpaidInvoiceCount}</div>
              </div>
            </div>
          )
        )}

        {tableCard(
          "Reconciliation Summary",
          "Read-only reconciliation preview.",
          preview?.status || "Loading",
          loading.preview ? (
            <div className="empty-state">Loading summary...</div>
          ) : preview ? (
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-label">Invoices Loaded</div>
                <div className="stat-value">
                  {preview.summary?.invoicesLoaded ?? 0}
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-label">Transactions Loaded</div>
                <div className="stat-value">
                  {preview.summary?.transactionsLoaded ?? 0}
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-label">Proposed Allocations</div>
                <div className="stat-value">
                  {preview.summary?.proposedAllocations ?? 0}
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-label">Duplicate Candidates</div>
                <div className="stat-value">
                  {preview.summary?.duplicateCandidates ?? 0}
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-state">Preview unavailable.</div>
          )
        )}

        {tableCard(
          "Recent Exceptions",
          "Latest reconciliation exceptions.",
          `${exceptions.length} records`,
          exceptions.length === 0 ? (
            <div className="empty-state">No exceptions found.</div>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Exception</th>
                    <th>Reason</th>
                    <th>Created</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {exceptions.slice(0, 5).map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="exception-type">
                          {item.type?.replaceAll("_", " ")}
                        </div>
                        <div className="exception-id">
                          {item.id.slice(0, 8)}
                        </div>
                      </td>
                      <td>{item.reason || "—"}</td>
                      <td>{formatDate(item.createdAt)}</td>
                      <td>{statusBadge(item.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </>
    );
  }

  function renderTransactions() {
    return (
      <>
        {heading(
          "BANKING",
          "Transactions",
          "View bank transactions imported into FinFlow AI.",
          loadTransactions,
          loading.transactions
        )}

        {error && <div className="error-banner">{error}</div>}

        {tableCard(
          "All Transactions",
          "Imported bank transaction records.",
          `${transactions.length} records`,
          loading.transactions ? (
            <div className="empty-state">Loading transactions...</div>
          ) : transactions.length === 0 ? (
            <div className="empty-state">No transactions found.</div>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Transaction</th>
                    <th>Reference</th>
                    <th>Date</th>
                    <th>Direction</th>
                    <th>Amount</th>
                    <th>Currency</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="exception-type">
                          {item.description || "—"}
                        </div>
                        <div className="exception-id">
                          {item.id.slice(0, 8)}
                        </div>
                      </td>
                      <td>{item.externalReference || "—"}</td>
                      <td>{formatDate(item.transactionDate)}</td>
                      <td>{item.direction || "—"}</td>
                      <td>{formatAmount(item.amount, item.currency)}</td>
                      <td>{item.currency || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </>
    );
  }

  function renderInvoices() {
    return (
      <>
        {heading(
          "BILLING",
          "Invoices",
          "Track vendor invoices, payment status, and outstanding amounts.",
          loadInvoices,
          loading.invoices
        )}

        {error && <div className="error-banner">{error}</div>}

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Total Invoices</div>
            <div className="stat-value">{invoices.length}</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Paid Amount</div>
            <div className="stat-value">
              {formatAmount(paidInvoiceAmount)}
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Outstanding</div>
            <div className="stat-value">
              {formatAmount(outstandingAmount)}
            </div>
          </div>
        </div>

        {tableCard(
          "All Invoices",
          "Vendor invoices recorded in FinFlow AI.",
          `${invoices.length} records`,
          loading.invoices ? (
            <div className="empty-state">Loading invoices...</div>
          ) : invoices.length === 0 ? (
            <div className="empty-state">No invoices found.</div>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Vendor</th>
                    <th>Issue Date</th>
                    <th>Due Date</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td>
                        <div className="exception-type">
                          {invoice.invoiceNumber}
                        </div>
                        <div className="exception-id">
                          {invoice.id.slice(0, 8)}
                        </div>
                      </td>
                      <td>{invoice.vendorNameSnapshot || "—"}</td>
                      <td>{formatDate(invoice.issueDate)}</td>
                      <td>{formatDate(invoice.dueDate)}</td>
                      <td>
                        {formatAmount(invoice.amount, invoice.currency)}
                      </td>
                      <td>{statusBadge(invoice.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </>
    );
  }

  function renderReconciliation() {
    return (
      <>
        {heading(
          "MATCHING",
          "Reconciliation",
          "Review proposed invoice-to-bank matches. This preview is read-only.",
          loadReconciliationData,
          loading.preview || loading.allocations
        )}

        {error && <div className="error-banner">{error}</div>}

        {reconciliationRun && (
          <div className="table-card">
            <div className="table-header">
              <div>
                <h2>Latest Reconciliation Run</h2>
                <p>{reconciliationRun.message || "Reconciliation run completed."}</p>
              </div>
              {statusBadge(reconciliationRun.run?.status || "COMPLETED")}
            </div>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-label">Run ID</div>
                <div className="exception-id">{reconciliationRun.run?.id || "—"}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Allocations Created</div>
                <div className="stat-value">
                  {reconciliationRun.summary?.allocationsCreated ??
                    reconciliationRun.summary?.proposedAllocations ??
                    reconciliationRun.allocationsCreated ??
                    "—"}
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Exceptions Created</div>
                <div className="stat-value">
                  {reconciliationRun.summary?.exceptionsCreated ??
                    reconciliationRun.summary?.exceptionCount ??
                    "—"}
                </div>
              </div>
            </div>
          </div>
        )}

        {preview?.readOnly && (
          <div className="error-banner">
            Read-only preview. No database records were changed.
          </div>
        )}

        {preview && (
          <div className="table-card">
            <div className="table-header">
              <div>
                <h2>Execute Reconciliation</h2>
                <p>Creates a run and saves proposed matches. Invoice statuses are not changed until allocations are approved.</p>
              </div>
              <button
                className="resolve-button"
                onClick={runReconciliation}
                disabled={
                  runningReconciliation ||
                  loading.preview ||
                  loading.allocations
                }
              >
                {runningReconciliation ? "Running..." : "▶ Run Reconciliation"}
              </button>
            </div>
            {(preview.allocations || []).some((proposal) =>
              allocations.some((existing) => existing.transactionId === proposal.transactionId)
            ) && (
              <div className="error-banner">
                Some preview transactions already have allocations. The API will skip those transactions and process only eligible new proposals.
              </div>
            )}
          </div>
        )}

        {loading.preview ? (
          <div className="table-card">
            <div className="empty-state">Loading reconciliation preview...</div>
          </div>
        ) : !preview ? (
          <div className="table-card">
            <div className="empty-state">Preview unavailable.</div>
          </div>
        ) : (
          <>
            <div className="stats-grid">
              {[
                ["Invoices Loaded", preview.summary?.invoicesLoaded],
                ["Transactions Loaded", preview.summary?.transactionsLoaded],
                ["Proposed Allocations", preview.summary?.proposedAllocations],
                ["Duplicate Candidates", preview.summary?.duplicateCandidates],
              ].map(([label, value]) => (
                <div className="stat-card" key={label}>
                  <div className="stat-label">{label}</div>
                  <div className="stat-value">{value ?? 0}</div>
                </div>
              ))}
            </div>

            {tableCard(
              "Proposed Allocations",
              "Suggested invoice-to-transaction matches.",
              `${preview.allocations?.length ?? 0} proposals`,
              !preview.allocations?.length ? (
                <div className="empty-state">No proposed allocations.</div>
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Invoice ID</th>
                        <th>Transaction ID</th>
                        <th>Amount</th>
                        <th>Currency</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.allocations.map((item, index) => (
                        <tr key={`${item.invoiceId}-${index}`}>
                          <td>{item.invoiceId.slice(0, 8)}</td>
                          <td>{item.transactionId.slice(0, 8)}</td>
                          <td>{formatAmount(item.amount, item.currency)}</td>
                          <td>{item.currency}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {tableCard(
              "Duplicate Candidates",
              "Potential duplicate transactions detected.",
              `${preview.duplicateCandidates?.length ?? 0} candidates`,
              !preview.duplicateCandidates?.length ? (
                <div className="empty-state">No duplicate candidates.</div>
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Original Transaction</th>
                        <th>Potential Duplicate</th>
                        <th>Method</th>
                        <th>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.duplicateCandidates.map((item, index) => (
                        <tr key={`${item.originalTransactionId}-${index}`}>
                          <td>{item.originalTransactionId.slice(0, 8)}</td>
                          <td>{item.duplicateTransactionId.slice(0, 8)}</td>
                          <td>{item.method}</td>
                          <td>{item.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {tableCard(
              "Invoice Payment Status",
              "Paid and outstanding amounts from the preview.",
              `${preview.invoiceStatuses?.length ?? 0} invoices`,
              !preview.invoiceStatuses?.length ? (
                <div className="empty-state">No invoice statuses available.</div>
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Invoice ID</th>
                        <th>Invoice Amount</th>
                        <th>Paid</th>
                        <th>Outstanding</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.invoiceStatuses.map((item) => (
                        <tr key={item.invoiceId}>
                          <td>{item.invoiceId.slice(0, 8)}</td>
                          <td>{formatAmount(item.invoiceAmount)}</td>
                          <td>{formatAmount(item.paidAmount)}</td>
                          <td>{formatAmount(item.outstandingAmount)}</td>
                          <td>{statusBadge(item.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </>
        )}
      </>
    );
  }

  function renderAllocations() {
    const proposedCount = allocations.filter((item) => item.status === "PROPOSED").length;
    return (
      <>
        {heading(
          "PAYMENT CONTROL",
          "Allocations",
          "Review proposed invoice-to-bank matches and approve or reject them.",
          () => Promise.all([loadAllocations(), loadInvoices(), loadAuditLogs()]),
          loading.allocations || loading.invoices || loading.audit
        )}

        {error && <div className="error-banner">{error}</div>}
        {notice && <div style={{ padding: "12px 16px", marginBottom: 16, borderRadius: 10, background: "#e8f7ee", color: "#176b3a", border: "1px solid #b9e5c9" }}>{notice}</div>}

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Total Allocations</div>
            <div className="stat-value">{allocations.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Awaiting Approval</div>
            <div className="stat-value">{proposedCount}</div>
            <div className="stat-caption">Require review</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Approved</div>
            <div className="stat-value">{allocations.filter((item) => item.status === "APPROVED").length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Rejected</div>
            <div className="stat-value">{allocations.filter((item) => item.status === "REJECTED").length}</div>
          </div>
        </div>

        {tableCard(
          "Payment Allocations",
          "Approving an allocation updates the invoice payment status and creates an audit record.",
          `${allocations.length} records`,
          loading.allocations ? (
            <div className="empty-state">Loading allocations...</div>
          ) : allocations.length === 0 ? (
            <div className="empty-state">No allocations found. Run reconciliation to create proposals.</div>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Vendor</th>
                    <th>Bank Transaction</th>
                    <th>Amount</th>
                    <th>Invoice Status</th>
                    <th>Allocation Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {allocations.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="exception-type">{item.invoice?.invoiceNumber || "—"}</div>
                        <div className="exception-id">{String(item.invoiceId || item.id).slice(0, 8)}</div>
                      </td>
                      <td>{item.invoice?.vendorNameSnapshot || "—"}</td>
                      <td>
                        <div className="exception-type">{item.transaction?.description || "Bank transaction"}</div>
                        <div className="exception-id">{item.transaction?.externalReference || String(item.transactionId || "").slice(0, 8)}</div>
                        <div className="exception-id">{formatDate(item.transaction?.transactionDate)}</div>
                      </td>
                      <td>{formatAmount(item.amount, item.currency)}</td>
                      <td>{statusBadge(item.invoice?.status || "UNKNOWN")}</td>
                      <td>{statusBadge(item.status)}</td>
                      <td>
                        {item.status === "PROPOSED" ? (
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button
                              className="resolve-button"
                              onClick={() => handleAllocationAction(item, "approve")}
                              disabled={processingAllocation === item.id}
                            >
                              {processingAllocation === item.id ? "Working..." : "✓ Approve"}
                            </button>
                            <button
                              className="cancel-button"
                              onClick={() => handleAllocationAction(item, "reject")}
                              disabled={processingAllocation === item.id}
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className="exception-id">No action available</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </>
    );
  }

  function renderExceptions() {
    return (
      <>
        {heading(
          "RECONCILIATION",
          "Exception Management",
          "Review, investigate, and resolve reconciliation exceptions.",
          loadExceptions,
          loading.exceptions
        )}

        {error && <div className="error-banner">{error}</div>}

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Total Exceptions</div>
            <div className="stat-value">{exceptions.length}</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Open Exceptions</div>
            <div className="stat-value">{openExceptions}</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Resolved</div>
            <div className="stat-value">{resolvedExceptions}</div>
          </div>
        </div>

        {tableCard(
          "All Exceptions",
          "Investigate flagged transactions and mismatches.",
          `${exceptions.length} records`,
          loading.exceptions ? (
            <div className="empty-state">Loading exceptions...</div>
          ) : exceptions.length === 0 ? (
            <div className="empty-state">No exceptions found.</div>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Exception</th>
                    <th>Related Transaction</th>
                    <th>Reason</th>
                    <th>Created</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {exceptions.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="exception-type">
                          {item.type?.replaceAll("_", " ")}
                        </div>
                        <div className="exception-id">
                          {item.id.slice(0, 8)}
                        </div>
                      </td>
                      <td>{item.transaction?.description || "—"}</td>
                      <td>{item.reason || "—"}</td>
                      <td>{formatDate(item.createdAt)}</td>
                      <td>{statusBadge(item.status)}</td>
                      <td>
                        <button
                          className="view-button"
                          onClick={() => {
                            setSelected(item);
                            setResolutionNote(item.resolutionNote || "");
                          }}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </>
    );
  }

  function renderAuditLog() {
    return (
      <>
        {heading(
          "ACTIVITY",
          "Audit Log",
          "Review historical actions performed in this workspace.",
          loadAuditLogs,
          loading.audit
        )}

        {error && <div className="error-banner">{error}</div>}

        {tableCard(
          "Workspace Activity",
          "Historical actions and system events.",
          `${auditLogs.length} records`,
          loading.audit ? (
            <div className="empty-state">Loading audit log...</div>
          ) : auditLogs.length === 0 ? (
            <div className="empty-state">
              No audit log records available for this workspace.
            </div>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>Actor</th>
                    <th>Entity</th>
                    <th>Details</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((item) => (
                    <tr key={item.id}>
                      <td>{item.action || item.eventType || "—"}</td>
                      <td>{item.actor?.name || item.actor?.email || item.actorName || item.actorId || "System"}</td>
                      <td>{item.entityType || item.resourceType || "—"}{item.entityId ? ` · ${String(item.entityId).slice(0, 8)}` : ""}</td>
                      <td>{item.details ? JSON.stringify(item.details) : item.description || item.note || "—"}</td>
                      <td>{formatDate(item.createdAt || item.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </>
    );
  }

  async function loadDocuments() {
    try {
      const response = await fetch(`${API_URL}${BASE}/documents`);
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not load documents.");
      setDocuments(result.documents || []);
    } catch (err) {
      setDocumentMessage(err.message || "Could not load documents.");
    }
  }

  async function uploadDocument() {
    if (!documentFile || documentUploading) return;
    setDocumentUploading(true);
    setDocumentMessage("");
    try {
      const formData = new FormData();
      formData.append("file", documentFile);
      const response = await fetch(`${API_URL}${BASE}/documents`, {
        method: "POST",
        body: formData,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `Upload failed (${response.status}).`);
      setDocumentMessage(`Indexed ${result.document?.fileName || documentFile.name} (${result.chunkCount} chunks).`);
      setDocumentFile(null);
      const input = document.getElementById("finflow-document-file");
      if (input) input.value = "";
      await loadDocuments();
    } catch (err) {
      setDocumentMessage(err.message || "Document upload failed.");
    } finally {
      setDocumentUploading(false);
    }
  }

  function renderDocuments() {
    return (
      <>
        {heading(
          "FINFLOW AI",
          "Financial Documents",
          "Upload PDF, TXT, or CSV files to make them searchable by the RAG assistant.",
          null,
          false
        )}
        <div className="table-card" style={{ maxWidth: 1000, padding: 24 }}>
          <h2 style={{ marginTop: 0 }}>Upload a document</h2>
          <p style={{ color: "#64748b", lineHeight: 1.6 }}>
            Files are stored locally and indexed into a workspace-specific vector store.
            Maximum upload size: 10 MB. Scanned PDFs without selectable text are not supported yet.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
            <input
              id="finflow-document-file"
              type="file"
              accept=".pdf,.txt,.csv,application/pdf,text/plain,text/csv"
              onChange={(event) => setDocumentFile(event.target.files?.[0] || null)}
            />
            <button className="resolve-button" onClick={uploadDocument} disabled={!documentFile || documentUploading}>
              {documentUploading ? "Uploading and indexing…" : "Upload & index"}
            </button>
            <button className="refresh-button" onClick={loadDocuments}>Refresh documents</button>
          </div>
          {documentMessage && <p role="status" style={{ marginTop: 14, color: documentMessage.startsWith("Indexed") ? "#067647" : "#b42318" }}>{documentMessage}</p>}
        </div>

        <div className="table-card" style={{ maxWidth: 1000, marginTop: 20 }}>
          <div className="table-header">
            <div><h2>Uploaded documents</h2><p>Only documents marked PROCESSED are indexed for retrieval.</p></div>
            <span className="record-count">{documents.length} documents</span>
          </div>
          {documents.length === 0 ? (
            <div style={{ padding: 24, color: "#64748b" }}>
              No documents listed yet. Upload a document, then refresh this list.
            </div>
          ) : (
            <div className="table-scroll">
              <table>
                <thead><tr><th>File</th><th>Type</th><th>Status</th><th>Uploaded</th></tr></thead>
                <tbody>
                  {documents.map((doc) => (
                    <tr key={doc.id}>
                      <td>{doc.fileName}</td>
                      <td>{doc.mimeType}</td>
                      <td>{doc.status}</td>
                      <td>{doc.createdAt ? new Date(doc.createdAt).toLocaleString() : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </>
    );
  }

  async function sendAssistantMessage(event) {
    event?.preventDefault();
    const question = assistantQuestion.trim();
    if (!question || assistantLoading) return;

    setAssistantMessages((previous) => [
      ...previous,
      { role: "user", content: question },
    ]);
    setAssistantQuestion("");
    setAssistantLoading(true);
    setError("");

    try {
      const response = await fetch(
        `${API_URL}${BASE}/assistant/${assistantUseRag ? "rag-chat" : assistantUseTools ? "agent-chat" : "chat"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question }),
        }
      );
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          result.error || result.message || `Assistant request failed (${response.status}).`
        );
      }

      setAssistantMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          content: result.answer || "The assistant returned an empty response.",
          sources: result.sources || [],
          toolsUsed: result.toolsUsed || [],
        },
      ]);
    } catch (err) {
      setAssistantMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          content: `I couldn’t get a response. ${err.message || "Check that the API and Ollama are running, then try again."}`,
          error: true,
        },
      ]);
    } finally {
      setAssistantLoading(false);
    }
  }

  function renderAssistant() {
    return (
      <>
        {heading(
          "FINFLOW AI",
          "AI Assistant",
          "Ask questions about your workspace’s financial and reconciliation data.",
          null,
          false
        )}

        <div className="table-card" style={{ maxWidth: 1000 }}>
          <div className="table-header">
            <div>
              <h2>Workspace Assistant</h2>
              <p>Read-only assistance · Answers are based on workspace data</p>
              <label style={{ display: "inline-flex", gap: 8, alignItems: "center", marginTop: 8, fontSize: 13 }}>
                <input type="checkbox" checked={assistantUseRag} onChange={(event) => {
                  setAssistantUseRag(event.target.checked);
                  if (event.target.checked) setAssistantUseTools(false);
                }} />
                Include uploaded documents (RAG)
              </label>
              <label style={{ display: "inline-flex", gap: 8, alignItems: "center", marginTop: 8, marginLeft: 14, fontSize: 13 }}>
                <input type="checkbox" checked={assistantUseTools} onChange={(event) => {
                  setAssistantUseTools(event.target.checked);
                  if (event.target.checked) setAssistantUseRag(false);
                }} />
                Allow read-only tool calls
              </label>
            </div>
            <span className="record-count">Local AI</span>
          </div>

          <div
            role="log"
            aria-live="polite"
            style={{
              minHeight: 320,
              maxHeight: "55vh",
              overflowY: "auto",
              padding: 20,
              display: "flex",
              flexDirection: "column",
              gap: 14,
              background: "#f8fafc",
            }}
          >
            {assistantMessages.map((message, index) => (
              <div
                key={`${index}-${message.role}`}
                style={{
                  alignSelf: message.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "85%",
                  whiteSpace: "pre-wrap",
                  overflowWrap: "anywhere",
                  padding: "12px 16px",
                  borderRadius: 12,
                  background: message.role === "user" ? "#243b64" : "#ffffff",
                  color: message.role === "user" ? "#ffffff" : message.error ? "#b42318" : "#243044",
                  border: message.role === "user" ? "1px solid #243b64" : "1px solid #e2e8f0",
                  lineHeight: 1.6,
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.75, marginBottom: 5 }}>
                  {message.role === "user" ? "YOU" : "FINFLOW AI"}
                </div>
                {message.content}
                {message.toolsUsed?.length > 0 && (
                  <div style={{ marginTop: 10, fontSize: 12, color: "#64748b" }}>
                    Read-only tools used: {message.toolsUsed.join(", ")}
                  </div>
                )}
                {message.sources?.length > 0 && (
                  <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid #e2e8f0", fontSize: 12 }}>
                    <strong>Retrieved sources:</strong>
                    {message.sources.map((source, sourceIndex) => (
                      <div key={`${source.documentId}-${sourceIndex}`} style={{ marginTop: 4 }}>
                        {source.fileName} {source.documentId ? `(document ${source.documentId.slice(0, 8)})` : ""}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {assistantLoading && (
              <div style={{ alignSelf: "flex-start", color: "#64748b", padding: "8px 2px" }}>
                FinFlow AI is thinking…
              </div>
            )}
          </div>

          <form onSubmit={sendAssistantMessage} style={{ padding: 18, borderTop: "1px solid #e2e8f0" }}>
            <label htmlFor="assistant-question" style={{ display: "block", fontWeight: 600, marginBottom: 8 }}>
              Your question
            </label>
            <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
              <textarea
                id="assistant-question"
                value={assistantQuestion}
                onChange={(event) => setAssistantQuestion(event.target.value)}
                placeholder="e.g. Summarize the financial health of this workspace."
                rows={2}
                maxLength={2000}
                disabled={assistantLoading}
                style={{ flex: 1, minWidth: 0, resize: "vertical", padding: 12, borderRadius: 8, border: "1px solid #cbd5e1", font: "inherit" }}
              />
              <button
                type="submit"
                className="resolve-button"
                disabled={assistantLoading || !assistantQuestion.trim()}
                style={{ alignSelf: "stretch", minWidth: 100 }}
              >
                {assistantLoading ? "Thinking…" : "Send ↗"}
              </button>
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>
              FinFlow AI is read-only. Verify important financial conclusions against your records.
            </div>
          </form>
        </div>
      </>
    );
  }

  function renderPage() {
    switch (activePage) {
      case "Overview":
        return renderOverview();
      case "Reconciliation":
        return renderReconciliation();
      case "Allocations":
        return renderAllocations();
      case "Transactions":
        return renderTransactions();
      case "Invoices":
        return renderInvoices();
      case "Exceptions":
        return renderExceptions();
      case "Audit Log":
        return renderAuditLog();
      case "AI Assistant":
        return renderAssistant();
      case "Documents":
        return renderDocuments();
      default:
        return renderOverview();
    }
  }

  return (
    <div className="dashboard">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">F</div>
          <span>
            FinFlow<span className="brand-ai"> AI</span>
          </span>
        </div>

        <div className="workspace-label">WORKSPACE</div>
        <div className="workspace-name">Demo Freelance Workspace</div>

        <nav className="navigation">
          {[
            ["Overview", "▦"],
            ["Reconciliation", "⇄"],
            ["Allocations", "✓"],
            ["Transactions", "▤"],
            ["Invoices", "▧"],
            ["Exceptions", "⚠"],
            ["Audit Log", "◷"],
            ["AI Assistant", "✦"],
            ["Documents", "▧"],
          ].map(([page, icon]) => (
            <button
              key={page}
              className={`nav-item ${activePage === page ? "active" : ""}`}
              onClick={() => navigateTo(page)}
            >
              {icon} {page}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="avatar">DF</div>
          <div>
            <div className="user-name">Demo Finance</div>
            <div className="user-role">Workspace Admin</div>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">Workspace / {activePage}</div>

          <div className="topbar-right">
            <span className="environment">● Demo Environment</span>
            <div className="top-avatar">DF</div>
          </div>
        </header>

        <section className="page-content">{renderPage()}</section>
      </main>

      {selected && (
        <div className="modal-overlay" onClick={() => { setSelected(null); setExceptionInsight(""); setExceptionInsightError(""); }}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="eyebrow">EXCEPTION DETAILS</div>
                <h2>{selected.type?.replaceAll("_", " ")}</h2>
              </div>

              <button
                className="close-button"
                onClick={() => { setSelected(null); setExceptionInsight(""); setExceptionInsightError(""); }}
              >
                ×
              </button>
            </div>

            <div className="modal-body">
              <div className="detail-row">
                <span>Status</span>
                {statusBadge(selected.status)}
              </div>

              <div className="detail-row">
                <span>Exception ID</span>
                <span>{selected.id}</span>
              </div>

              <div className="detail-row">
                <span>Created</span>
                <span>{formatDate(selected.createdAt)}</span>
              </div>

              <div className="detail-section">
                <label>Reason</label>
                <div className="reason-box">{selected.reason || "—"}</div>
              </div>

              {selected.transaction && (
                <div className="detail-section">
                  <label>Related Transaction</label>
                  <div className="reason-box">
                    {selected.transaction.description || "—"}
                  </div>
                </div>
              )}

              {selected.invoice && (
                <div className="detail-section">
                  <label>Related Invoice</label>
                  <div className="reason-box">
                    {selected.invoice.vendorNameSnapshot || "—"}
                  </div>
                </div>
              )}

              <div className="detail-section">
                <label>AI Reconciliation Insight</label>
                <button
                  className="secondary-button"
                  onClick={requestExceptionInsight}
                  disabled={exceptionInsightLoading}
                  style={{ marginBottom: 10 }}
                >
                  {exceptionInsightLoading ? "Analyzing exception…" : "Explain with FinFlow AI"}
                </button>
                {exceptionInsightError && <div className="reason-box" style={{ color: "#b42318" }}>{exceptionInsightError}</div>}
                {exceptionInsight && <div className="reason-box" style={{ whiteSpace: "pre-wrap" }}>{exceptionInsight}</div>}
                <small style={{ color: "#64748b" }}>Advisory only. This does not resolve the exception or change financial records.</small>
              </div>

              <div className="detail-section">
                <label>Resolution Note</label>
                <textarea
                  value={resolutionNote}
                  onChange={(event) => setResolutionNote(event.target.value)}
                  placeholder="Explain how this exception was resolved..."
                  disabled={selected.status === "RESOLVED"}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="cancel-button"
                onClick={() => { setSelected(null); setExceptionInsight(""); setExceptionInsightError(""); }}
              >
                Close
              </button>

              {(selected.status === "OPEN" ||
                selected.status === "IN_REVIEW") && (
                <button
                  className="resolve-button"
                  onClick={resolveException}
                  disabled={resolving || !resolutionNote.trim()}
                >
                  {resolving ? "Resolving..." : "✓ Resolve Exception"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;