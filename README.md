# FinFlow AI

**AI-assisted financial operations and reconciliation platform** for freelancers and independent professionals.

FinFlow AI brings invoice management, bank-transaction reconciliation, payment allocation, exception handling, document processing, and financial Q&A into one workspace.

> **Project status:** Portfolio / development project. Use demo data only. This is not a production-ready accounting or banking system.

## Highlights

- **Invoice and transaction management** — organize invoices and bank transactions by workspace.
- **Reconciliation engine** — match transactions against invoices using deterministic and fuzzy matching workflows.
- **Payment allocation** — review proposed allocations and approve or reject them.
- **Exception management** — surface unmatched, ambiguous, duplicate, partial-payment, and overpayment cases for review.
- **Document processing** — upload financial documents and extract text for downstream workflows.
- **RAG-powered financial assistant** — retrieve relevant passages from uploaded documents to answer workspace questions.
- **Audit trail** — record reconciliation and financial workflow events.
- **Workspace-oriented data model** — organize financial records, documents, and reconciliation activity by workspace.

## Screenshots

_Add screenshots or a short demo GIF here._

Suggested screenshots:
- Overview dashboard
- Reconciliation results
- Exception review
- Invoice and transaction views
- AI Assistant with document citations/sources

## Architecture

```text
React + Vite frontend
        |
        | HTTP API
        v
Node.js + Express API
        |
        +---- Reconciliation services
        |       - exact matching
        |       - fuzzy matching
        |       - duplicate detection
        |       - payment status / allocation
        |
        +---- Document processing + RAG
        |       - PDF text extraction
        |       - text chunking
        |       - Ollama embeddings
        |       - FAISS vector search
        |
        v
PostgreSQL + Prisma
```

### Technology stack

| Area | Technologies |
|---|---|
| Frontend | React, Vite, JavaScript, CSS |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL, Prisma ORM |
| Reconciliation | TypeScript matching and allocation services |
| AI / RAG | LangChain, Ollama, FAISS, PDF parsing |
| Testing | Vitest (reconciliation engine) |

## Repository structure

```text
Finflow-ai/
├── apps/
│   ├── web/                     # React + Vite dashboard
│   └── api/                     # Express API, document processing, AI/RAG
├── services/
│   ├── database/                # Prisma schema, migrations, database utilities
│   └── reconciliation-engine/   # Matching, allocation, ingestion, tests
├── .gitignore
└── README.md
```

## Getting started

### Prerequisites

Install the following before running the project:

- Node.js (use a current LTS release)
- npm
- PostgreSQL
- Ollama, if you want to run the local embedding / AI document workflows

The repository contains multiple npm packages. Install dependencies in each package directory.

### 1. Clone the repository

```bash
git clone https://github.com/<your-username>/finflow-ai.git
cd finflow-ai
```

### 2. Configure environment variables

Create environment files for the API and database packages as needed. Do not commit real credentials.

Example variables (adjust names to match your current code and local setup):

```env
# PostgreSQL
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/finflow"

# Ollama
OLLAMA_BASE_URL="http://localhost:11434"
OLLAMA_EMBEDDING_MODEL="nomic-embed-text"
```

> Check the database package and API configuration before copying this example: Prisma 7 may use a separate Prisma config file for the connection URL. Keep `.env.example` synchronized with the actual variable names used by the project.

### 3. Install dependencies

```bash
# Frontend
cd apps/web
npm install

# API
cd ../api
npm install

# Database package
cd ../../services/database
npm install

# Reconciliation engine
cd ../reconciliation-engine
npm install
```

### 4. Set up PostgreSQL and Prisma

Create a PostgreSQL database and configure the connection string used by your Prisma setup.

Run the database migration and generate the Prisma client using the commands configured in your database package / Prisma config. For example, the usual Prisma commands are:

```bash
npx prisma migrate deploy
npx prisma generate
```

> Confirm the correct working directory and Prisma 7 configuration before running these commands. The project’s `prisma7.config.ts` may affect how the CLI loads the datasource.

### 5. Start the services

Start the API from its package directory:

```bash
cd apps/api
npm run dev
```

Start the frontend in a separate terminal:

```bash
cd apps/web
npm run dev
```

The frontend’s Vite development server typically runs at `http://localhost:5173`. The API’s port is determined by the server configuration.

## Reconciliation engine

The reconciliation engine is separated into a service package and includes functionality for:

- CSV transaction ingestion
- Exact-match logic
- Fuzzy matching
- Duplicate detection
- Confidence scoring
- Payment-status calculation
- Allocation logic
- Reconciliation pipeline orchestration

Run its test suite from the package directory:

```bash
cd services/reconciliation-engine
npm test
```

If the package uses a different test script in your local checkout, use the script listed in its `package.json`.

## AI document assistant

The document assistant uses a retrieval-augmented generation (RAG) workflow:

1. A user uploads a financial document.
2. The API extracts document text.
3. Text is split into chunks and embedded using Ollama.
4. Chunks are stored in a workspace-specific FAISS index.
5. A user asks a question.
6. Relevant chunks are retrieved and passed to the assistant as context.

**Local model setup:** Install and start Ollama, then pull the embedding model configured in your environment. The exact chat model depends on the assistant configuration in `apps/api/src`.

Uploaded documents and generated vector indexes are runtime data. They should not be committed to the repository.

## Demo data and privacy

- Use synthetic invoices and transactions for demos and screenshots.
- Do not upload real bank statements, invoices, tax records, or customer data to a public demo.
- Do not commit `.env` files, credentials, uploaded documents, or vector-store data.
- The demo workspace ID currently used in the frontend should be treated as a local/demo configuration, not a production identity.
- This project is a portfolio prototype and has not been represented as audited, secure, or production-ready financial software.

## Roadmap

- [ ] Add a polished end-to-end demo and screenshots
- [ ] Improve setup documentation and environment validation
- [ ] Make API URL, CORS origin, and demo workspace configurable
- [ ] Add authentication and authorization before handling real financial data
- [ ] Add integration tests for database-backed workflows
- [ ] Add observability and structured logging
- [ ] Improve document lifecycle handling and cleanup
- [ ] Add deployment guidance for a secure demo environment

## Contributing

This is currently a personal portfolio project. Issues and suggestions are welcome.

If you want to contribute:
1. Fork the repository.
2. Create a feature branch.
3. Add or update tests for behavior changes.
4. Open a pull request describing the change.

## License

No license has been added yet. Unless a license is included, others do not automatically have permission to reuse, modify, or distribute this code. Add a license if you intend to allow reuse.

---

Built as a portfolio project exploring financial workflow automation, reconciliation systems, document processing, and retrieval-augmented AI.
