//! Schema diff engine for comparing PostgreSQL schemas.

use serde::{Deserialize, Serialize};
use uuid::Uuid;
use crate::model::schema::{SchemaModel, Table, Column, Index, EnumType};

/// The kind of difference detected.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum DiffKind {
    Added,
    Removed,
    Modified,
}

/// A single diff item representing a schema difference.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffItem {
    pub id: String,
    pub kind: DiffKind,
    pub object_type: String,
    pub object_name: String,
    pub details: String,
    pub generated_up_sql: String,
    pub generated_down_sql: String,
    pub dangerous: bool,
}

impl DiffItem {
    fn new(
        kind: DiffKind,
        object_type: &str,
        object_name: &str,
        details: &str,
        up_sql: &str,
        down_sql: &str,
        dangerous: bool,
    ) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            kind,
            object_type: object_type.to_string(),
            object_name: object_name.to_string(),
            details: details.to_string(),
            generated_up_sql: up_sql.to_string(),
            generated_down_sql: down_sql.to_string(),
            dangerous,
        }
    }
}

/// The complete diff report containing all differences.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffReport {
    pub items: Vec<DiffItem>,
    pub source_connection: String,
    pub target_connection: String,
    pub generated_at: String,
}

impl DiffReport {
    pub fn new() -> Self {
        Self {
            items: Vec::new(),
            source_connection: String::new(),
            target_connection: String::new(),
            generated_at: chrono::Utc::now().to_rfc3339(),
        }
    }
    
    pub fn has_dangerous(&self) -> bool {
        self.items.iter().any(|i| i.dangerous)
    }
}

impl Default for DiffReport {
    fn default() -> Self {
        Self::new()
    }
}

/// Known PostgreSQL built-in types that don't need quoting.
const BUILTIN_TYPES: &[&str] = &[
    "integer", "int", "int4", "int8", "int2", "smallint", "bigint",
    "serial", "serial4", "serial8", "smallserial", "bigserial",
    "text", "varchar", "character varying", "char", "character", "bpchar",
    "boolean", "bool",
    "real", "float4", "double precision", "float8", "numeric", "decimal",
    "date", "time", "timetz", "timestamp", "timestamptz", 
    "timestamp without time zone", "timestamp with time zone",
    "time without time zone", "time with time zone",
    "uuid", "json", "jsonb", "xml",
    "bytea", "bit", "bit varying", "varbit",
    "inet", "cidr", "macaddr", "macaddr8",
    "money", "interval", "point", "line", "lseg", "box", "path", "polygon", "circle",
    "tsquery", "tsvector", "oid", "name", "regclass", "regtype",
];

/// Check if a data type is a PostgreSQL built-in type.
fn is_builtin_type(data_type: &str) -> bool {
    let lower = data_type.to_lowercase();
    // Remove any array suffix or size specifier
    let base_type = lower
        .trim_end_matches("[]")
        .split('(')
        .next()
        .unwrap_or(&lower)
        .trim();
    
    BUILTIN_TYPES.iter().any(|t| *t == base_type)
}

/// Format a data type for SQL, quoting ENUM types but not built-in types.
fn format_data_type(data_type: &str) -> String {
    if is_builtin_type(data_type) {
        data_type.to_string()
    } else {
        // This is likely an ENUM or user-defined type - quote it
        format!("\"{}\"", data_type)
    }
}

/// Compare two schema models and return a diff report.
/// Source is what we want to achieve (the desired state).
/// Target is the current state of the database.
pub fn compare_schemas(source: &SchemaModel, target: &SchemaModel) -> DiffReport {
    let mut report = DiffReport::new();
    
    // IMPORTANT: Compare ENUM types first (they must be created before tables that use them)
    compare_enums(&mut report, source, target);
    
    // Find tables that need to be added (in source but not in target)
    for source_table in &source.tables {
        if target.find_table(&source_table.name).is_none() {
            let up_sql = generate_create_table_sql(source_table);
            let down_sql = format!("DROP TABLE IF EXISTS \"{}\" CASCADE;", source_table.name);
            
            report.items.push(DiffItem::new(
                DiffKind::Added,
                "table",
                &source_table.name,
                &format!("Create table '{}'", source_table.name),
                &up_sql,
                &down_sql,
                false,
            ));
        }
    }
    
    // Find tables that need to be removed (in target but not in source)
    for target_table in &target.tables {
        if source.find_table(&target_table.name).is_none() {
            let up_sql = format!("DROP TABLE IF EXISTS \"{}\" CASCADE;", target_table.name);
            let down_sql = generate_create_table_sql(target_table);
            
            report.items.push(DiffItem::new(
                DiffKind::Removed,
                "table",
                &target_table.name,
                &format!("Drop table '{}'", target_table.name),
                &up_sql,
                &down_sql,
                true, // Dropping a table is dangerous
            ));
        }
    }
    
    // Compare tables that exist in both
    for source_table in &source.tables {
        if let Some(target_table) = target.find_table(&source_table.name) {
            compare_tables(&mut report, source_table, target_table);
        }
    }
    
    report
}

/// Compare ENUM types between source and target.
fn compare_enums(report: &mut DiffReport, source: &SchemaModel, target: &SchemaModel) {
    // Find ENUMs that need to be added
    for source_enum in &source.enums {
        if let Some(target_enum) = target.find_enum(&source_enum.name) {
            // ENUM exists, check if values differ
            if source_enum.values != target_enum.values {
                // Find new values to add
                let new_values: Vec<&String> = source_enum.values.iter()
                    .filter(|v| !target_enum.values.contains(v))
                    .collect();
                
                // Find values to remove (dangerous!)
                let removed_values: Vec<&String> = target_enum.values.iter()
                    .filter(|v| !source_enum.values.contains(v))
                    .collect();
                
                if !new_values.is_empty() {
                    let up_sql = new_values.iter()
                        .map(|v| format!("ALTER TYPE \"{}\" ADD VALUE IF NOT EXISTS '{}';", source_enum.name, v))
                        .collect::<Vec<_>>()
                        .join("\n");
                    
                    // Note: PostgreSQL doesn't support removing ENUM values easily
                    let down_sql = format!("-- Cannot easily remove ENUM values in PostgreSQL\n-- Removed values: {:?}", new_values);
                    
                    report.items.push(DiffItem::new(
                        DiffKind::Modified,
                        "enum",
                        &source_enum.name,
                        &format!("Add values to enum '{}': {:?}", source_enum.name, new_values),
                        &up_sql,
                        &down_sql,
                        false,
                    ));
                }
                
                if !removed_values.is_empty() {
                    // Removing ENUM values requires recreating the type
                    let up_sql = format!(
                        "-- WARNING: Removing ENUM values requires recreating the type\n\
                         -- Values to remove: {:?}\n\
                         -- This is a destructive operation that requires manual handling",
                        removed_values
                    );
                    let down_sql = removed_values.iter()
                        .map(|v| format!("ALTER TYPE \"{}\" ADD VALUE IF NOT EXISTS '{}';", source_enum.name, v))
                        .collect::<Vec<_>>()
                        .join("\n");
                    
                    report.items.push(DiffItem::new(
                        DiffKind::Modified,
                        "enum",
                        &source_enum.name,
                        &format!("Remove values from enum '{}': {:?} (DANGEROUS)", source_enum.name, removed_values),
                        &up_sql,
                        &down_sql,
                        true,
                    ));
                }
            }
        } else {
            // ENUM doesn't exist, create it
            let up_sql = generate_create_enum_sql(source_enum);
            let down_sql = format!("DROP TYPE IF EXISTS \"{}\" CASCADE;", source_enum.name);
            
            report.items.push(DiffItem::new(
                DiffKind::Added,
                "enum",
                &source_enum.name,
                &format!("Create enum type '{}' with values: {:?}", source_enum.name, source_enum.values),
                &up_sql,
                &down_sql,
                false,
            ));
        }
    }
    
    // Find ENUMs that need to be removed
    for target_enum in &target.enums {
        if source.find_enum(&target_enum.name).is_none() {
            let up_sql = format!("DROP TYPE IF EXISTS \"{}\" CASCADE;", target_enum.name);
            let down_sql = generate_create_enum_sql(target_enum);
            
            report.items.push(DiffItem::new(
                DiffKind::Removed,
                "enum",
                &target_enum.name,
                &format!("Drop enum type '{}'", target_enum.name),
                &up_sql,
                &down_sql,
                true,
            ));
        }
    }
}

/// Generate CREATE TYPE ... AS ENUM SQL for an enum type.
fn generate_create_enum_sql(enum_type: &EnumType) -> String {
    let values = enum_type.values.iter()
        .map(|v| format!("'{}'", v))
        .collect::<Vec<_>>()
        .join(", ");
    
    format!("CREATE TYPE \"{}\" AS ENUM ({});", enum_type.name, values)
}

/// Compare two tables and add differences to the report.
fn compare_tables(report: &mut DiffReport, source: &Table, target: &Table) {
    // Compare columns
    compare_columns(report, source, target);
    
    // Compare primary key
    compare_primary_keys(report, source, target);
    
    // Compare unique constraints
    compare_unique_constraints(report, source, target);
    
    // Compare indexes
    compare_indexes(report, source, target);
}

/// Compare columns between two tables.
fn compare_columns(report: &mut DiffReport, source: &Table, target: &Table) {
    // Find columns to add
    for source_col in &source.columns {
        if target.find_column(&source_col.name).is_none() {
            let up_sql = generate_add_column_sql(&source.name, source_col);
            let down_sql = format!(
                "ALTER TABLE \"{}\" DROP COLUMN IF EXISTS \"{}\";",
                source.name, source_col.name
            );
            
            report.items.push(DiffItem::new(
                DiffKind::Added,
                "column",
                &format!("{}.{}", source.name, source_col.name),
                &format!("Add column '{}' to table '{}'", source_col.name, source.name),
                &up_sql,
                &down_sql,
                false,
            ));
        }
    }
    
    // Find columns to remove
    for target_col in &target.columns {
        if source.find_column(&target_col.name).is_none() {
            let up_sql = format!(
                "ALTER TABLE \"{}\" DROP COLUMN IF EXISTS \"{}\";",
                source.name, target_col.name
            );
            let down_sql = generate_add_column_sql(&target.name, target_col);
            
            report.items.push(DiffItem::new(
                DiffKind::Removed,
                "column",
                &format!("{}.{}", target.name, target_col.name),
                &format!("Drop column '{}' from table '{}'", target_col.name, target.name),
                &up_sql,
                &down_sql,
                true, // Dropping a column is dangerous
            ));
        }
    }
    
    // Find modified columns
    for source_col in &source.columns {
        if let Some(target_col) = target.find_column(&source_col.name) {
            if !source_col.same_definition(target_col) {
                let changes = describe_column_changes(source_col, target_col);
                let (up_sql, down_sql) = generate_alter_column_sql(&source.name, source_col, target_col);
                
                let dangerous = source_col.data_type != target_col.data_type;
                
                report.items.push(DiffItem::new(
                    DiffKind::Modified,
                    "column",
                    &format!("{}.{}", source.name, source_col.name),
                    &changes,
                    &up_sql,
                    &down_sql,
                    dangerous,
                ));
            }
        }
    }
}

/// Compare primary keys between two tables.
fn compare_primary_keys(report: &mut DiffReport, source: &Table, target: &Table) {
    match (&source.primary_key, &target.primary_key) {
        (Some(source_pk), None) => {
            // Add primary key
            let up_sql = format!(
                "ALTER TABLE \"{}\" ADD CONSTRAINT \"{}\" PRIMARY KEY ({});",
                source.name,
                source_pk.name,
                source_pk.columns.iter().map(|c| format!("\"{}\"", c)).collect::<Vec<_>>().join(", ")
            );
            let down_sql = format!(
                "ALTER TABLE \"{}\" DROP CONSTRAINT IF EXISTS \"{}\";",
                source.name, source_pk.name
            );
            
            report.items.push(DiffItem::new(
                DiffKind::Added,
                "constraint",
                &format!("{}.{}", source.name, source_pk.name),
                &format!("Add primary key '{}' to table '{}'", source_pk.name, source.name),
                &up_sql,
                &down_sql,
                false,
            ));
        }
        (None, Some(target_pk)) => {
            // Remove primary key
            let up_sql = format!(
                "ALTER TABLE \"{}\" DROP CONSTRAINT IF EXISTS \"{}\";",
                target.name, target_pk.name
            );
            let down_sql = format!(
                "ALTER TABLE \"{}\" ADD CONSTRAINT \"{}\" PRIMARY KEY ({});",
                target.name,
                target_pk.name,
                target_pk.columns.iter().map(|c| format!("\"{}\"", c)).collect::<Vec<_>>().join(", ")
            );
            
            report.items.push(DiffItem::new(
                DiffKind::Removed,
                "constraint",
                &format!("{}.{}", target.name, target_pk.name),
                &format!("Drop primary key '{}' from table '{}'", target_pk.name, target.name),
                &up_sql,
                &down_sql,
                true,
            ));
        }
        (Some(source_pk), Some(target_pk)) => {
            // Check if primary key columns changed
            if source_pk.columns != target_pk.columns {
                let up_sql = format!(
                    "ALTER TABLE \"{}\" DROP CONSTRAINT IF EXISTS \"{}\";\nALTER TABLE \"{}\" ADD CONSTRAINT \"{}\" PRIMARY KEY ({});",
                    source.name, target_pk.name,
                    source.name, source_pk.name,
                    source_pk.columns.iter().map(|c| format!("\"{}\"", c)).collect::<Vec<_>>().join(", ")
                );
                let down_sql = format!(
                    "ALTER TABLE \"{}\" DROP CONSTRAINT IF EXISTS \"{}\";\nALTER TABLE \"{}\" ADD CONSTRAINT \"{}\" PRIMARY KEY ({});",
                    source.name, source_pk.name,
                    source.name, target_pk.name,
                    target_pk.columns.iter().map(|c| format!("\"{}\"", c)).collect::<Vec<_>>().join(", ")
                );
                
                report.items.push(DiffItem::new(
                    DiffKind::Modified,
                    "constraint",
                    &format!("{}.{}", source.name, source_pk.name),
                    &format!("Modify primary key '{}' on table '{}'", source_pk.name, source.name),
                    &up_sql,
                    &down_sql,
                    true,
                ));
            }
        }
        (None, None) => {}
    }
}

/// Compare unique constraints between two tables.
fn compare_unique_constraints(report: &mut DiffReport, source: &Table, target: &Table) {
    // Find constraints to add
    for source_uc in &source.unique_constraints {
        let exists = target.unique_constraints.iter().any(|t| {
            t.name == source_uc.name || t.columns == source_uc.columns
        });
        
        if !exists {
            let up_sql = format!(
                "ALTER TABLE \"{}\" ADD CONSTRAINT \"{}\" UNIQUE ({});",
                source.name,
                source_uc.name,
                source_uc.columns.iter().map(|c| format!("\"{}\"", c)).collect::<Vec<_>>().join(", ")
            );
            let down_sql = format!(
                "ALTER TABLE \"{}\" DROP CONSTRAINT IF EXISTS \"{}\";",
                source.name, source_uc.name
            );
            
            report.items.push(DiffItem::new(
                DiffKind::Added,
                "constraint",
                &format!("{}.{}", source.name, source_uc.name),
                &format!("Add unique constraint '{}' to table '{}'", source_uc.name, source.name),
                &up_sql,
                &down_sql,
                false,
            ));
        }
    }
    
    // Find constraints to remove
    for target_uc in &target.unique_constraints {
        let exists = source.unique_constraints.iter().any(|s| {
            s.name == target_uc.name || s.columns == target_uc.columns
        });
        
        if !exists {
            let up_sql = format!(
                "ALTER TABLE \"{}\" DROP CONSTRAINT IF EXISTS \"{}\";",
                target.name, target_uc.name
            );
            let down_sql = format!(
                "ALTER TABLE \"{}\" ADD CONSTRAINT \"{}\" UNIQUE ({});",
                target.name,
                target_uc.name,
                target_uc.columns.iter().map(|c| format!("\"{}\"", c)).collect::<Vec<_>>().join(", ")
            );
            
            report.items.push(DiffItem::new(
                DiffKind::Removed,
                "constraint",
                &format!("{}.{}", target.name, target_uc.name),
                &format!("Drop unique constraint '{}' from table '{}'", target_uc.name, target.name),
                &up_sql,
                &down_sql,
                false,
            ));
        }
    }
}

/// Compare indexes between two tables.
fn compare_indexes(report: &mut DiffReport, source: &Table, target: &Table) {
    // Find indexes to add
    for source_idx in &source.indexes {
        let exists = target.indexes.iter().any(|t| {
            t.name == source_idx.name || (t.columns == source_idx.columns && t.is_unique == source_idx.is_unique)
        });
        
        if !exists {
            let up_sql = generate_create_index_sql(&source.name, source_idx);
            let down_sql = format!("DROP INDEX IF EXISTS \"{}\";", source_idx.name);
            
            report.items.push(DiffItem::new(
                DiffKind::Added,
                "index",
                &format!("{}.{}", source.name, source_idx.name),
                &format!("Create index '{}' on table '{}'", source_idx.name, source.name),
                &up_sql,
                &down_sql,
                false,
            ));
        }
    }
    
    // Find indexes to remove
    for target_idx in &target.indexes {
        let exists = source.indexes.iter().any(|s| {
            s.name == target_idx.name || (s.columns == target_idx.columns && s.is_unique == target_idx.is_unique)
        });
        
        if !exists {
            let up_sql = format!("DROP INDEX IF EXISTS \"{}\";", target_idx.name);
            let down_sql = generate_create_index_sql(&target.name, target_idx);
            
            report.items.push(DiffItem::new(
                DiffKind::Removed,
                "index",
                &format!("{}.{}", target.name, target_idx.name),
                &format!("Drop index '{}' from table '{}'", target_idx.name, target.name),
                &up_sql,
                &down_sql,
                false,
            ));
        }
    }
}

/// Generate CREATE TABLE SQL statement.
fn generate_create_table_sql(table: &Table) -> String {
    let mut sql = String::new();
    
    // First, create sequences for columns with nextval defaults
    for col in &table.columns {
        if let Some(default) = &col.default_value {
            if let Some(seq_name) = extract_sequence_name(default) {
                sql.push_str(&format!(
                    "CREATE SEQUENCE IF NOT EXISTS \"{}\";\n",
                    seq_name
                ));
            }
        }
    }
    
    sql.push_str(&format!("CREATE TABLE \"{}\" (\n", table.name));
    
    let mut parts: Vec<String> = Vec::new();
    
    // Columns
    for col in &table.columns {
        let col_def = generate_column_definition(col);
        parts.push(format!("    {}", col_def));
    }
    
    // Primary key
    if let Some(pk) = &table.primary_key {
        parts.push(format!(
            "    CONSTRAINT \"{}\" PRIMARY KEY ({})",
            pk.name,
            pk.columns.iter().map(|c| format!("\"{}\"", c)).collect::<Vec<_>>().join(", ")
        ));
    }
    
    // Unique constraints
    for uc in &table.unique_constraints {
        parts.push(format!(
            "    CONSTRAINT \"{}\" UNIQUE ({})",
            uc.name,
            uc.columns.iter().map(|c| format!("\"{}\"", c)).collect::<Vec<_>>().join(", ")
        ));
    }
    
    sql.push_str(&parts.join(",\n"));
    sql.push_str("\n);\n");
    
    // Indexes (created separately)
    for idx in &table.indexes {
        sql.push_str(&generate_create_index_sql(&table.name, idx));
        sql.push('\n');
    }
    
    sql
}

/// Generate column definition for CREATE TABLE or ADD COLUMN.
fn generate_column_definition(col: &Column) -> String {
    // Check if this is a serial/identity column
    if let Some(default) = &col.default_value {
        if is_serial_default(default) {
            // Convert to appropriate SERIAL type
            let serial_type = match col.data_type.as_str() {
                "bigint" => "BIGSERIAL",
                "smallint" => "SMALLSERIAL", 
                _ => "SERIAL",
            };
            
            let mut col_def = format!("\"{}\" {}", col.name, serial_type);
            if !col.is_nullable {
                col_def.push_str(" NOT NULL");
            }
            return col_def;
        }
    }
    
    // Use format_data_type to properly quote ENUM types
    let mut col_def = format!("\"{}\" {}", col.name, format_data_type(&col.data_type));
    
    if !col.is_nullable {
        col_def.push_str(" NOT NULL");
    }
    
    if let Some(default) = &col.default_value {
        col_def.push_str(&format!(" DEFAULT {}", default));
    }
    
    col_def
}

/// Check if a default value represents a serial/sequence column.
fn is_serial_default(default: &str) -> bool {
    let lower = default.to_lowercase();
    lower.contains("nextval(") && lower.contains("_seq")
}

/// Extract sequence name from a nextval default.
fn extract_sequence_name(default: &str) -> Option<String> {
    // Match patterns like: nextval('table_id_seq'::regclass)
    let lower = default.to_lowercase();
    if lower.contains("nextval(") {
        // Extract the sequence name from the string
        if let Some(start) = default.find('\'') {
            if let Some(end) = default[start + 1..].find('\'') {
                let seq_name = &default[start + 1..start + 1 + end];
                // Remove schema prefix if present
                let clean_name = seq_name.split('.').last().unwrap_or(seq_name);
                return Some(clean_name.to_string());
            }
        }
    }
    None
}

/// Generate ADD COLUMN SQL statement.
fn generate_add_column_sql(table_name: &str, column: &Column) -> String {
    let mut sql = String::new();
    
    // First, create sequence if needed
    if let Some(default) = &column.default_value {
        if let Some(seq_name) = extract_sequence_name(default) {
            sql.push_str(&format!(
                "CREATE SEQUENCE IF NOT EXISTS \"{}\";\n",
                seq_name
            ));
        }
    }
    
    // Check if this is a serial column
    if let Some(default) = &column.default_value {
        if is_serial_default(default) {
            let serial_type = match column.data_type.as_str() {
                "bigint" => "BIGSERIAL",
                "smallint" => "SMALLSERIAL",
                _ => "SERIAL",
            };
            
            sql.push_str(&format!(
                "ALTER TABLE \"{}\" ADD COLUMN \"{}\" {}",
                table_name, column.name, serial_type
            ));
            
            if !column.is_nullable {
                sql.push_str(" NOT NULL");
            }
            
            sql.push(';');
            return sql;
        }
    }
    
    // Use format_data_type to properly quote ENUM types
    sql.push_str(&format!(
        "ALTER TABLE \"{}\" ADD COLUMN \"{}\" {}",
        table_name, column.name, format_data_type(&column.data_type)
    ));
    
    if !column.is_nullable {
        sql.push_str(" NOT NULL");
    }
    
    if let Some(default) = &column.default_value {
        sql.push_str(&format!(" DEFAULT {}", default));
    }
    
    sql.push(';');
    sql
}

/// Generate ALTER COLUMN SQL statements.
fn generate_alter_column_sql(table_name: &str, source: &Column, target: &Column) -> (String, String) {
    let mut up_parts = Vec::new();
    let mut down_parts = Vec::new();
    
    // Type change
    if source.data_type != target.data_type {
        let source_type = format_data_type(&source.data_type);
        let target_type = format_data_type(&target.data_type);
        up_parts.push(format!(
            "ALTER TABLE \"{}\" ALTER COLUMN \"{}\" TYPE {} USING \"{}\"::{}",
            table_name, source.name, source_type, source.name, source_type
        ));
        down_parts.push(format!(
            "ALTER TABLE \"{}\" ALTER COLUMN \"{}\" TYPE {} USING \"{}\"::{}",
            table_name, source.name, target_type, source.name, target_type
        ));
    }
    
    // Nullability change
    if source.is_nullable != target.is_nullable {
        if source.is_nullable {
            up_parts.push(format!(
                "ALTER TABLE \"{}\" ALTER COLUMN \"{}\" DROP NOT NULL",
                table_name, source.name
            ));
            down_parts.push(format!(
                "ALTER TABLE \"{}\" ALTER COLUMN \"{}\" SET NOT NULL",
                table_name, source.name
            ));
        } else {
            up_parts.push(format!(
                "ALTER TABLE \"{}\" ALTER COLUMN \"{}\" SET NOT NULL",
                table_name, source.name
            ));
            down_parts.push(format!(
                "ALTER TABLE \"{}\" ALTER COLUMN \"{}\" DROP NOT NULL",
                table_name, source.name
            ));
        }
    }
    
    // Default change
    if source.default_value != target.default_value {
        match &source.default_value {
            Some(default) => {
                up_parts.push(format!(
                    "ALTER TABLE \"{}\" ALTER COLUMN \"{}\" SET DEFAULT {}",
                    table_name, source.name, default
                ));
            }
            None => {
                up_parts.push(format!(
                    "ALTER TABLE \"{}\" ALTER COLUMN \"{}\" DROP DEFAULT",
                    table_name, source.name
                ));
            }
        }
        
        match &target.default_value {
            Some(default) => {
                down_parts.push(format!(
                    "ALTER TABLE \"{}\" ALTER COLUMN \"{}\" SET DEFAULT {}",
                    table_name, source.name, default
                ));
            }
            None => {
                down_parts.push(format!(
                    "ALTER TABLE \"{}\" ALTER COLUMN \"{}\" DROP DEFAULT",
                    table_name, source.name
                ));
            }
        }
    }
    
    (
        up_parts.iter().map(|s| format!("{};", s)).collect::<Vec<_>>().join("\n"),
        down_parts.iter().map(|s| format!("{};", s)).collect::<Vec<_>>().join("\n"),
    )
}

/// Generate CREATE INDEX SQL statement.
fn generate_create_index_sql(table_name: &str, index: &Index) -> String {
    let unique = if index.is_unique { "UNIQUE " } else { "" };
    let using = if index.index_type != "btree" {
        format!(" USING {}", index.index_type)
    } else {
        String::new()
    };
    
    format!(
        "CREATE {}INDEX \"{}\" ON \"{}\"{} ({});",
        unique,
        index.name,
        table_name,
        using,
        index.columns.iter().map(|c| format!("\"{}\"", c)).collect::<Vec<_>>().join(", ")
    )
}

/// Describe the changes between two columns.
fn describe_column_changes(source: &Column, target: &Column) -> String {
    let mut changes = Vec::new();
    
    if source.data_type != target.data_type {
        changes.push(format!("type: {} -> {}", target.data_type, source.data_type));
    }
    
    if source.is_nullable != target.is_nullable {
        changes.push(format!(
            "nullable: {} -> {}",
            target.is_nullable, source.is_nullable
        ));
    }
    
    if source.default_value != target.default_value {
        changes.push(format!(
            "default: {:?} -> {:?}",
            target.default_value, source.default_value
        ));
    }
    
    format!("Modify column '{}': {}", source.name, changes.join(", "))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_column(name: &str, data_type: &str, nullable: bool) -> Column {
        Column {
            name: name.to_string(),
            data_type: data_type.to_string(),
            is_nullable: nullable,
            default_value: None,
            ordinal_position: 1,
        }
    }

    fn create_test_table(name: &str, columns: Vec<Column>) -> Table {
        Table {
            name: name.to_string(),
            columns,
            primary_key: None,
            unique_constraints: Vec::new(),
            indexes: Vec::new(),
        }
    }

    #[test]
    fn test_added_table() {
        let source = SchemaModel {
            tables: vec![create_test_table(
                "users",
                vec![create_test_column("id", "integer", false)],
            )],
        };
        let target = SchemaModel { tables: vec![] };

        let report = compare_schemas(&source, &target);

        assert_eq!(report.items.len(), 1);
        assert_eq!(report.items[0].kind, DiffKind::Added);
        assert_eq!(report.items[0].object_type, "table");
        assert_eq!(report.items[0].object_name, "users");
        assert!(!report.items[0].dangerous);
    }

    #[test]
    fn test_removed_table() {
        let source = SchemaModel { tables: vec![] };
        let target = SchemaModel {
            tables: vec![create_test_table(
                "users",
                vec![create_test_column("id", "integer", false)],
            )],
        };

        let report = compare_schemas(&source, &target);

        assert_eq!(report.items.len(), 1);
        assert_eq!(report.items[0].kind, DiffKind::Removed);
        assert_eq!(report.items[0].object_type, "table");
        assert_eq!(report.items[0].object_name, "users");
        assert!(report.items[0].dangerous);
    }

    #[test]
    fn test_added_column() {
        let source = SchemaModel {
            tables: vec![create_test_table(
                "users",
                vec![
                    create_test_column("id", "integer", false),
                    create_test_column("email", "varchar(255)", false),
                ],
            )],
        };
        let target = SchemaModel {
            tables: vec![create_test_table(
                "users",
                vec![create_test_column("id", "integer", false)],
            )],
        };

        let report = compare_schemas(&source, &target);

        assert_eq!(report.items.len(), 1);
        assert_eq!(report.items[0].kind, DiffKind::Added);
        assert_eq!(report.items[0].object_type, "column");
        assert_eq!(report.items[0].object_name, "users.email");
    }

    #[test]
    fn test_removed_column() {
        let source = SchemaModel {
            tables: vec![create_test_table(
                "users",
                vec![create_test_column("id", "integer", false)],
            )],
        };
        let target = SchemaModel {
            tables: vec![create_test_table(
                "users",
                vec![
                    create_test_column("id", "integer", false),
                    create_test_column("email", "varchar(255)", false),
                ],
            )],
        };

        let report = compare_schemas(&source, &target);

        assert_eq!(report.items.len(), 1);
        assert_eq!(report.items[0].kind, DiffKind::Removed);
        assert_eq!(report.items[0].object_type, "column");
        assert!(report.items[0].dangerous);
    }

    #[test]
    fn test_modified_column_type() {
        let source = SchemaModel {
            tables: vec![create_test_table(
                "users",
                vec![create_test_column("name", "text", false)],
            )],
        };
        let target = SchemaModel {
            tables: vec![create_test_table(
                "users",
                vec![create_test_column("name", "varchar(100)", false)],
            )],
        };

        let report = compare_schemas(&source, &target);

        assert_eq!(report.items.len(), 1);
        assert_eq!(report.items[0].kind, DiffKind::Modified);
        assert_eq!(report.items[0].object_type, "column");
        assert!(report.items[0].dangerous); // Type change is dangerous
    }

    #[test]
    fn test_modified_column_nullability() {
        let source = SchemaModel {
            tables: vec![create_test_table(
                "users",
                vec![create_test_column("name", "text", false)],
            )],
        };
        let target = SchemaModel {
            tables: vec![create_test_table(
                "users",
                vec![create_test_column("name", "text", true)],
            )],
        };

        let report = compare_schemas(&source, &target);

        assert_eq!(report.items.len(), 1);
        assert_eq!(report.items[0].kind, DiffKind::Modified);
        assert!(!report.items[0].dangerous); // Nullability change is not dangerous
    }

    #[test]
    fn test_no_diff() {
        let schema = SchemaModel {
            tables: vec![create_test_table(
                "users",
                vec![create_test_column("id", "integer", false)],
            )],
        };

        let report = compare_schemas(&schema, &schema);

        assert!(report.items.is_empty());
    }

    #[test]
    fn test_primary_key_added() {
        let mut source_table = create_test_table(
            "users",
            vec![create_test_column("id", "integer", false)],
        );
        source_table.primary_key = Some(Constraint {
            name: "users_pkey".to_string(),
            constraint_type: "PRIMARY KEY".to_string(),
            columns: vec!["id".to_string()],
        });

        let source = SchemaModel {
            tables: vec![source_table],
        };
        let target = SchemaModel {
            tables: vec![create_test_table(
                "users",
                vec![create_test_column("id", "integer", false)],
            )],
        };

        let report = compare_schemas(&source, &target);

        assert_eq!(report.items.len(), 1);
        assert_eq!(report.items[0].kind, DiffKind::Added);
        assert_eq!(report.items[0].object_type, "constraint");
    }

    #[test]
    fn test_index_added() {
        let mut source_table = create_test_table(
            "users",
            vec![create_test_column("email", "varchar(255)", false)],
        );
        source_table.indexes.push(Index {
            name: "idx_users_email".to_string(),
            columns: vec!["email".to_string()],
            is_unique: false,
            index_type: "btree".to_string(),
        });

        let source = SchemaModel {
            tables: vec![source_table],
        };
        let target = SchemaModel {
            tables: vec![create_test_table(
                "users",
                vec![create_test_column("email", "varchar(255)", false)],
            )],
        };

        let report = compare_schemas(&source, &target);

        assert_eq!(report.items.len(), 1);
        assert_eq!(report.items[0].kind, DiffKind::Added);
        assert_eq!(report.items[0].object_type, "index");
    }
}
