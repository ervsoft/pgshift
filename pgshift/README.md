# PGShift - PostgreSQL Schema Migration Tool

A cross-platform desktop application for comparing PostgreSQL database schemas and generating migration files.

![PGShift Screenshot](docs/screenshot.png)

## Features

- **Schema Introspection**: Automatically extract schema metadata from PostgreSQL databases
- **Visual Diff**: Compare source and target schemas with a clear visual interface
- **Migration Generation**: Generate UP/DOWN migration SQL files
- **Safe Execution**: Apply migrations within transactions with rollback on error
- **Dangerous Operation Warnings**: Highlights destructive operations (DROP TABLE, DROP COLUMN, type changes)

## MVP Scope

This is an MVP version that supports:
- **Public schema only**
- Tables
- Columns (with data types, nullability, defaults)
- Primary Key constraints
- Unique constraints
- Indexes (btree, hash, gin, gist)

Not yet supported: Foreign keys, check constraints, views, functions, triggers, other schemas, sequences, extensions, roles/permissions.

## Prerequisites

- **Node.js** >= 18
- **pnpm** (recommended) or npm
- **Rust** >= 1.70
- **PostgreSQL** databases for testing

### Install Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### Install pnpm

```bash
npm install -g pnpm
```

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/pgshift.git
cd pgshift
```

2. Install dependencies:
```bash
pnpm install
```

3. Run in development mode:
```bash
pnpm tauri dev
```

## Building for Production

```bash
pnpm tauri build
```

The built application will be in `src-tauri/target/release/bundle/`.

## Usage

### 1. Configure Connections

Navigate to the **Connections** page and enter your source and target PostgreSQL connection strings:

```
postgres://username:password@hostname:port/database_name
```

**Example connection strings:**
```
postgres://postgres:secret@localhost:5432/myapp_dev
postgres://admin:password@db.example.com:5432/production
```

Click "Test Connection" to verify each connection.

### 2. Compare Schemas

Navigate to the **Compare** page and click "Compare Schemas". The tool will:

1. Introspect the source database (desired state)
2. Introspect the target database (current state)
3. Compute the differences

Review the diff tree on the left side. Click on any item to see details and the generated SQL.

### 3. Generate Migration

Enter a migration name (e.g., `add_users_table`) and click "Generate Migration".

The migration files will be created in:
```
./migrations/<timestamp>__<name>/
├── up.sql      # Apply changes
├── down.sql    # Rollback changes
└── meta.json   # Metadata
```

### 4. Apply Migration

Navigate to the **Apply** page to execute the migration on your target database.

⚠️ **Warning**: Always review the migration SQL and test on a staging environment first!

## Migration File Structure

```
migrations/
└── 20260203120000__add_users_table/
    ├── up.sql      # Forward migration (apply changes)
    ├── down.sql    # Backward migration (rollback)
    └── meta.json   # Metadata with item list and flags
```

### meta.json Example

```json
{
  "name": "add_users_table",
  "timestamp": "20260203120000",
  "generated_at": "2026-02-03T12:00:00Z",
  "items_count": 3,
  "has_dangerous": false,
  "items": [
    {
      "id": "uuid-here",
      "kind": "added",
      "object_type": "table",
      "object_name": "users",
      "dangerous": false
    }
  ]
}
```

## Project Structure

```
pgshift/
├── src-tauri/           # Rust backend
│   ├── src/
│   │   ├── main.rs      # Tauri entry point
│   │   ├── lib.rs       # Library exports
│   │   ├── commands.rs  # Tauri commands
│   │   ├── db/          # Database operations
│   │   │   ├── connect.rs
│   │   │   └── introspect.rs
│   │   ├── model/       # Data models
│   │   │   └── schema.rs
│   │   ├── diff/        # Schema comparison
│   │   │   └── diff.rs
│   │   ├── render/      # SQL generation
│   │   │   └── sql.rs
│   │   └── apply/       # Migration execution
│   │       └── exec.rs
│   └── Cargo.toml
├── src/                 # React frontend
│   ├── pages/
│   │   ├── ConnectionsPage.tsx
│   │   ├── ComparePage.tsx
│   │   └── ApplyPage.tsx
│   ├── components/
│   │   ├── DiffTree.tsx
│   │   ├── DiffDetails.tsx
│   │   ├── SqlPreview.tsx
│   │   └── LogViewer.tsx
│   ├── types/
│   │   └── index.ts
│   ├── App.tsx
│   ├── App.css
│   └── main.tsx
├── package.json
├── vite.config.ts
├── SPEC.md
└── README.md
```

## Development

### Run Tests

```bash
cd src-tauri
cargo test
```

### Run Linting

```bash
cd src-tauri
cargo clippy
```

### Frontend Development

The frontend uses Vite for hot-reload development. Any changes to React components will automatically reload.

## Troubleshooting

### Connection Issues

- Ensure PostgreSQL is running and accessible
- Check firewall rules for the database port (usually 5432)
- Verify the connection string format
- Make sure the user has sufficient permissions to read schema metadata

### Build Issues

- Run `pnpm install` to ensure all dependencies are installed
- Update Rust: `rustup update`
- Clear Cargo cache: `cargo clean`

### SSL/TLS Issues

If connecting to a database with SSL, you may need to modify the connection string:
```
postgres://user:pass@host:5432/db?sslmode=require
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with [Tauri](https://tauri.app/)
- Uses [sqlx](https://github.com/launchbadge/sqlx) for PostgreSQL connectivity
- Frontend powered by [React](https://react.dev/) and [Vite](https://vitejs.dev/)
