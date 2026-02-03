# PGShift - PostgreSQL Schema Migration Tool

## Overview

PGShift is a cross-platform desktop application for comparing PostgreSQL database schemas and generating migration files. It provides a visual diff interface and can apply migrations to target databases.

## Technology Stack

- **Backend**: Tauri v2 + Rust
- **Frontend**: React + TypeScript + Vite
- **Database**: PostgreSQL (via sqlx)
- **Runtime**: Tokio async runtime

## MVP Scope

### Supported Objects (public schema only)
- Tables
- Columns (with data types, nullability, defaults)
- Primary Key constraints
- Unique constraints
- Indexes (btree, hash, gin, gist)

### Not in MVP
- Foreign keys
- Check constraints
- Views, functions, triggers
- Other schemas besides `public`
- Sequences (standalone)
- Extensions
- Roles/permissions

## Core Features

### 1. Connection Management
- Store source and target PostgreSQL connection strings
- Test connection before use
- Connection format: `postgres://user:password@host:port/database`

### 2. Schema Introspection
- Extract schema metadata from PostgreSQL information_schema and pg_catalog
- Build canonical model representation

### 3. Schema Comparison (Diff)
- Compare source vs target schemas
- Identify: added, removed, modified objects
- Generate unique ID for each diff item
- Flag dangerous operations (DROP TABLE, DROP COLUMN, type changes)

### 4. Migration Generation
- Generate UP SQL (apply changes)
- Generate DOWN SQL (rollback changes)
- Store migrations in `./migrations/<timestamp>__<name>/`
  - `up.sql` - Forward migration
  - `down.sql` - Rollback migration
  - `meta.json` - Metadata (timestamp, name, items, dangerous flags)

### 5. Migration Application
- Apply UP migration to target database
- Execute in transaction with rollback on error
- Log execution results

## Data Models

### SchemaModel
```rust
struct SchemaModel {
    tables: Vec<Table>,
}
```

### Table
```rust
struct Table {
    name: String,
    columns: Vec<Column>,
    primary_key: Option<Constraint>,
    unique_constraints: Vec<Constraint>,
    indexes: Vec<Index>,
}
```

### Column
```rust
struct Column {
    name: String,
    data_type: String,
    is_nullable: bool,
    default_value: Option<String>,
    ordinal_position: i32,
}
```

### Constraint
```rust
struct Constraint {
    name: String,
    constraint_type: String, // PRIMARY KEY, UNIQUE
    columns: Vec<String>,
}
```

### Index
```rust
struct Index {
    name: String,
    columns: Vec<String>,
    is_unique: bool,
    index_type: String, // btree, hash, gin, gist
}
```

### DiffItem
```rust
struct DiffItem {
    id: String,           // Unique identifier
    kind: DiffKind,       // Added, Removed, Modified
    object_type: String,  // table, column, constraint, index
    object_name: String,  // Full object name (table.column)
    details: String,      // Human-readable description
    generated_up_sql: String,
    generated_down_sql: String,
    dangerous: bool,      // True for DROP operations, type changes
}
```

### DiffKind
```rust
enum DiffKind {
    Added,
    Removed,
    Modified,
}
```

### DiffReport
```rust
struct DiffReport {
    items: Vec<DiffItem>,
    source_connection: String,
    target_connection: String,
    generated_at: String,
}
```

## Tauri Commands

### test_connection
```rust
#[tauri::command]
async fn test_connection(connection_string: String) -> Result<bool, String>
```

### introspect
```rust
#[tauri::command]
async fn introspect(connection_string: String) -> Result<SchemaModel, String>
```

### diff
```rust
#[tauri::command]
async fn diff(source: SchemaModel, target: SchemaModel) -> Result<DiffReport, String>
```

### render_migration
```rust
#[tauri::command]
async fn render_migration(
    report: DiffReport,
    name: String,
    base_path: String,
) -> Result<String, String>
```

### apply_migration
```rust
#[tauri::command]
async fn apply_migration(
    connection_string: String,
    migration_path: String,
) -> Result<Vec<String>, String>
```

## UI Pages

### 1. Connections Page
- Source connection input
- Target connection input
- Test connection buttons
- Connection status indicators

### 2. Compare Page
- "Compare" button to run introspection and diff
- Diff tree view (grouped by object type)
- Details panel for selected diff item
- SQL preview (UP/DOWN tabs)
- "Generate Migration" button

### 3. Apply Page
- Migration name input
- Migration file browser
- "Apply Migration" button
- Execution log display

## File Structure

```
pgshift/
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── main.rs
│       ├── lib.rs
│       ├── commands.rs
│       ├── db/
│       │   ├── mod.rs
│       │   ├── connect.rs
│       │   └── introspect.rs
│       ├── model/
│       │   ├── mod.rs
│       │   └── schema.rs
│       ├── diff/
│       │   ├── mod.rs
│       │   └── diff.rs
│       ├── render/
│       │   ├── mod.rs
│       │   └── sql.rs
│       └── apply/
│           ├── mod.rs
│           └── exec.rs
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── App.css
│   ├── pages/
│   │   ├── ConnectionsPage.tsx
│   │   ├── ComparePage.tsx
│   │   └── ApplyPage.tsx
│   ├── components/
│   │   ├── DiffTree.tsx
│   │   ├── DiffDetails.tsx
│   │   ├── SqlPreview.tsx
│   │   └── LogViewer.tsx
│   └── types/
│       └── index.ts
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

## Error Handling

- All Rust functions return `Result<T, String>` for Tauri compatibility
- Database errors wrapped with context
- UI displays error messages clearly
- Failed migrations trigger transaction rollback

## Security Considerations

- Connection strings stored in memory only (not persisted in MVP)
- Parameterized queries for all database operations
- Migrations executed within transactions
