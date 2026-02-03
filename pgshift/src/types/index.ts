// TypeScript types matching the Rust structs

export interface Column {
  name: string;
  data_type: string;
  is_nullable: boolean;
  default_value: string | null;
  ordinal_position: number;
}

export interface Constraint {
  name: string;
  constraint_type: string;
  columns: string[];
}

export interface Index {
  name: string;
  columns: string[];
  is_unique: boolean;
  index_type: string;
}

export interface EnumType {
  name: string;
  values: string[];
}

export interface Table {
  name: string;
  columns: Column[];
  primary_key: Constraint | null;
  unique_constraints: Constraint[];
  indexes: Index[];
}

export interface SchemaModel {
  tables: Table[];
  indexes: Index[];
  enums: EnumType[];
}

export type DiffKind = 'added' | 'removed' | 'modified';

export interface DiffItem {
  id: string;
  kind: DiffKind;
  object_type: string;
  object_name: string;
  details: string;
  generated_up_sql: string;
  generated_down_sql: string;
  dangerous: boolean;
}

export interface DiffReport {
  items: DiffItem[];
  source_connection: string;
  target_connection: string;
  generated_at: string;
}

// Single database connection info
export interface DatabaseConnection {
  id: string;
  name: string;
  connectionString: string;
  connected: boolean;
  testing: boolean;
  schema?: SchemaModel | null;
  dbInfo?: DatabaseInfo | null;
}

// Legacy ConnectionState for backward compatibility
export interface ConnectionState {
  source: string;
  target: string;
  sourceConnected: boolean;
  targetConnected: boolean;
  sourceTesting: boolean;
  targetTesting: boolean;
  sourceSchema?: SchemaModel | null;
  targetSchema?: SchemaModel | null;
  sourceDbInfo?: DatabaseInfo | null;
  targetDbInfo?: DatabaseInfo | null;
}

// New multi-connection state
export interface MultiConnectionState {
  sources: DatabaseConnection[];
  targets: DatabaseConnection[];
}

export interface AppState {
  connections: ConnectionState;
  multiConnections: MultiConnectionState;
  sourceSchema: SchemaModel | null;
  targetSchema: SchemaModel | null;
  mergedSchema: SchemaModel | null; // For multi-source merge
  diffReport: DiffReport | null;
  selectedDiffItem: DiffItem | null;
  migrationPath: string | null;
  logs: string[];
  loading: boolean;
  error: string | null;
}

// Database Browser types
export interface DatabaseInfo {
  database_name: string;
  current_user: string;
  pg_version: string;
  database_size: string;
  table_count: number;
}

export interface TableRow {
  values: Record<string, unknown>;
}

export interface TableDataResult {
  columns: string[];
  rows: TableRow[];
  total_count: number;
  page: number;
  page_size: number;
}

export interface QueryResult {
  type: 'select' | 'execute';
  columns?: string[];
  rows?: Record<string, unknown>[];
  row_count?: number;
  rows_affected?: number;
}

// Schema Versioning types
export interface SchemaVersion {
  id: string;
  name: string;
  description: string;
  connection_string: string;
  database_name: string;
  schema: SchemaModel;
  created_at: string;
  tags: string[];
}

export interface VersionDiff {
  from_version: string;
  to_version: string;
  diff_report: DiffReport;
}

// Migration types
export interface Migration {
  name: string;
  path: string;
  up_sql: string | null;
  down_sql: string | null;
  meta: {
    name?: string;
    generated_at?: string;
    source_connection?: string;
    target_connection?: string;
    change_count?: number;
  } | null;
}

// Saved Connection type
export interface SavedConnection {
  id: string;
  name: string;
  fields: {
    host: string;
    port: string;
    database: string;
    user: string;
    password: string;
  };
  createdAt: string;
}

// Multi-target migration result
export interface MigrationApplyResult {
  connectionId: string;
  connectionName: string;
  success: boolean;
  error?: string;
  logs: string[];
}

// Schema merge options
export interface MergeOptions {
  conflictResolution: 'first' | 'last' | 'error';
  includeAllTables: boolean;
  includeAllEnums: boolean;
}
