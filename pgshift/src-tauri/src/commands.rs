//! Tauri commands for the PGShift application.

use crate::db::{connect, introspect as db_introspect};
use crate::model::schema::SchemaModel;
use crate::diff::diff as diff_engine;
use crate::diff::DiffReport;
use crate::render::sql::render_migration_files;
use crate::apply::exec::apply_migration_sql;
use std::fs;
use std::path::Path;
use serde::{Deserialize, Serialize};
use sqlx::{Row, Column};
use chrono::Utc;

/// Table row data for browsing
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TableRow {
    pub values: std::collections::HashMap<String, serde_json::Value>,
}

/// Pagination info for table data
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TableDataResult {
    pub columns: Vec<String>,
    pub rows: Vec<TableRow>,
    pub total_count: i64,
    pub page: i32,
    pub page_size: i32,
}

/// Schema version snapshot
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SchemaVersion {
    pub id: String,
    pub name: String,
    pub description: String,
    pub connection_string: String,
    pub database_name: String,
    pub schema: SchemaModel,
    pub created_at: String,
    pub tags: Vec<String>,
}

/// Schema version diff between two versions
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VersionDiff {
    pub from_version: String,
    pub to_version: String,
    pub diff_report: DiffReport,
}

/// Test a PostgreSQL connection string.
#[tauri::command]
pub async fn test_connection(connection_string: String) -> Result<bool, String> {
    match connect::test_connection(&connection_string).await {
        Ok(_) => Ok(true),
        Err(e) => Err(format!("Connection failed: {}", e)),
    }
}

/// Introspect a PostgreSQL database and return its schema model.
#[tauri::command]
pub async fn introspect(connection_string: String) -> Result<SchemaModel, String> {
    let pool = connect::create_pool(&connection_string)
        .await
        .map_err(|e| format!("Failed to connect: {}", e))?;
    
    db_introspect::introspect_schema(&pool)
        .await
        .map_err(|e| format!("Introspection failed: {}", e))
}

/// Compare two schema models and return a diff report.
#[tauri::command]
pub async fn diff(source: SchemaModel, target: SchemaModel) -> Result<DiffReport, String> {
    Ok(diff_engine::compare_schemas(&source, &target))
}

/// Render migration files to disk.
#[tauri::command]
pub async fn render_migration(
    report: DiffReport,
    name: String,
    base_path: String,
) -> Result<String, String> {
    render_migration_files(&report, &name, &base_path)
        .map_err(|e| format!("Failed to render migration: {}", e))
}

/// Apply a migration to the target database.
#[tauri::command]
pub async fn apply_migration(
    connection_string: String,
    migration_path: String,
) -> Result<Vec<String>, String> {
    let pool = connect::create_pool(&connection_string)
        .await
        .map_err(|e| format!("Failed to connect: {}", e))?;
    
    apply_migration_sql(&pool, &migration_path)
        .await
        .map_err(|e| format!("Migration failed: {}", e))
}

/// Get the default migrations directory.
#[tauri::command]
pub async fn get_migrations_dir() -> Result<String, String> {
    // Use user's home directory to avoid triggering hot-reload
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Could not find home directory".to_string())?;
    
    let migrations_dir = home_dir.join("PGShift").join("migrations");
    
    // Create the directory if it doesn't exist
    if !migrations_dir.exists() {
        fs::create_dir_all(&migrations_dir)
            .map_err(|e| format!("Failed to create migrations directory: {}", e))?;
    }
    
    Ok(migrations_dir.to_string_lossy().to_string())
}

/// Get database info (name, version, size, etc.)
#[tauri::command]
pub async fn get_database_info(connection_string: String) -> Result<serde_json::Value, String> {
    let pool = connect::create_pool(&connection_string)
        .await
        .map_err(|e| format!("Failed to connect: {}", e))?;
    
    let row = sqlx::query(
        r#"
        SELECT 
            current_database() as database_name,
            current_user as current_user,
            version() as pg_version,
            pg_size_pretty(pg_database_size(current_database())) as database_size,
            (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE') as table_count
        "#
    )
    .fetch_one(&pool)
    .await
    .map_err(|e| format!("Failed to get database info: {}", e))?;
    
    Ok(serde_json::json!({
        "database_name": row.get::<String, _>("database_name"),
        "current_user": row.get::<String, _>("current_user"),
        "pg_version": row.get::<String, _>("pg_version"),
        "database_size": row.get::<String, _>("database_size"),
        "table_count": row.get::<i64, _>("table_count"),
    }))
}

/// Get table data with pagination for database browser
#[tauri::command]
pub async fn get_table_data(
    connection_string: String,
    table_name: String,
    page: i32,
    page_size: i32,
    order_by: Option<String>,
    order_dir: Option<String>,
) -> Result<TableDataResult, String> {
    let pool = connect::create_pool(&connection_string)
        .await
        .map_err(|e| format!("Failed to connect: {}", e))?;
    
    // Get column names
    let col_rows = sqlx::query(
        r#"
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
        "#
    )
    .bind(&table_name)
    .fetch_all(&pool)
    .await
    .map_err(|e| format!("Failed to get columns: {}", e))?;
    
    let columns: Vec<String> = col_rows.iter().map(|r| r.get("column_name")).collect();
    
    // Get total count
    let count_query = format!("SELECT COUNT(*) as cnt FROM \"{}\"", table_name);
    let count_row = sqlx::query(&count_query)
        .fetch_one(&pool)
        .await
        .map_err(|e| format!("Failed to count rows: {}", e))?;
    let total_count: i64 = count_row.get("cnt");
    
    // Build data query with pagination
    let order_clause = match (order_by, order_dir) {
        (Some(col), Some(dir)) => format!("ORDER BY \"{}\" {}", col, if dir == "DESC" { "DESC" } else { "ASC" }),
        (Some(col), None) => format!("ORDER BY \"{}\" ASC", col),
        _ => String::new(),
    };
    
    let offset = (page - 1) * page_size;
    let data_query = format!(
        "SELECT * FROM \"{}\" {} LIMIT {} OFFSET {}",
        table_name, order_clause, page_size, offset
    );
    
    let rows = sqlx::query(&data_query)
        .fetch_all(&pool)
        .await
        .map_err(|e| format!("Failed to fetch data: {}", e))?;
    
    let mut result_rows = Vec::new();
    for row in rows {
        let mut values = std::collections::HashMap::new();
        for (idx, col) in columns.iter().enumerate() {
            // Try to get as different types and convert to JSON
            let val: serde_json::Value = if let Ok(v) = row.try_get::<String, usize>(idx) {
                serde_json::Value::String(v)
            } else if let Ok(v) = row.try_get::<i64, usize>(idx) {
                serde_json::Value::Number(v.into())
            } else if let Ok(v) = row.try_get::<i32, usize>(idx) {
                serde_json::Value::Number(v.into())
            } else if let Ok(v) = row.try_get::<f64, usize>(idx) {
                serde_json::json!(v)
            } else if let Ok(v) = row.try_get::<bool, usize>(idx) {
                serde_json::Value::Bool(v)
            } else if let Ok(v) = row.try_get::<Option<String>, usize>(idx) {
                match v {
                    Some(s) => serde_json::Value::String(s),
                    None => serde_json::Value::Null,
                }
            } else {
                serde_json::Value::Null
            };
            values.insert(col.clone(), val);
        }
        result_rows.push(TableRow { values });
    }
    
    Ok(TableDataResult {
        columns,
        rows: result_rows,
        total_count,
        page,
        page_size,
    })
}

/// Execute a raw SQL query (for database browser)
#[tauri::command]
pub async fn execute_query(
    connection_string: String,
    query: String,
) -> Result<serde_json::Value, String> {
    let pool = connect::create_pool(&connection_string)
        .await
        .map_err(|e| format!("Failed to connect: {}", e))?;
    
    // Detect if it's a SELECT query
    let trimmed = query.trim().to_uppercase();
    if trimmed.starts_with("SELECT") || trimmed.starts_with("WITH") {
        let rows = sqlx::query(&query)
            .fetch_all(&pool)
            .await
            .map_err(|e| format!("Query failed: {}", e))?;
        
        // Get column info from first row
        if rows.is_empty() {
            return Ok(serde_json::json!({
                "type": "select",
                "columns": [],
                "rows": [],
                "row_count": 0
            }));
        }
        
        let columns: Vec<String> = rows[0].columns().iter().map(|c| c.name().to_string()).collect();
        let mut result_rows = Vec::new();
        
        for row in &rows {
            let mut values = std::collections::HashMap::new();
            for (idx, col) in columns.iter().enumerate() {
                let val: serde_json::Value = if let Ok(v) = row.try_get::<String, usize>(idx) {
                    serde_json::Value::String(v)
                } else if let Ok(v) = row.try_get::<i64, usize>(idx) {
                    serde_json::Value::Number(v.into())
                } else if let Ok(v) = row.try_get::<i32, usize>(idx) {
                    serde_json::Value::Number(v.into())
                } else if let Ok(v) = row.try_get::<f64, usize>(idx) {
                    serde_json::json!(v)
                } else if let Ok(v) = row.try_get::<bool, usize>(idx) {
                    serde_json::Value::Bool(v)
                } else {
                    serde_json::Value::Null
                };
                values.insert(col.clone(), val);
            }
            result_rows.push(values);
        }
        
        Ok(serde_json::json!({
            "type": "select",
            "columns": columns,
            "rows": result_rows,
            "row_count": result_rows.len()
        }))
    } else {
        // Execute non-select query
        let result = sqlx::query(&query)
            .execute(&pool)
            .await
            .map_err(|e| format!("Query failed: {}", e))?;
        
        Ok(serde_json::json!({
            "type": "execute",
            "rows_affected": result.rows_affected()
        }))
    }
}

/// Export migration files to a specified directory
#[tauri::command]
pub async fn export_migration(
    report: DiffReport,
    name: String,
    export_path: String,
) -> Result<String, String> {
    let path = Path::new(&export_path);
    if !path.exists() {
        fs::create_dir_all(path).map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    
    render_migration_files(&report, &name, &export_path)
        .map_err(|e| format!("Failed to export migration: {}", e))
}

/// Get list of all migration files from a directory
#[tauri::command]
pub async fn list_migrations(base_path: String) -> Result<Vec<serde_json::Value>, String> {
    let path = Path::new(&base_path);
    if !path.exists() {
        return Ok(Vec::new());
    }
    
    let mut migrations = Vec::new();
    
    let entries = fs::read_dir(path)
        .map_err(|e| format!("Failed to read directory: {}", e))?;
    
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let entry_path = entry.path();
        
        if entry_path.is_dir() {
            let dir_name = entry_path.file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();
            
            // Look for up.sql, down.sql, meta.json
            let up_sql = entry_path.join("up.sql");
            let down_sql = entry_path.join("down.sql");
            let meta_json = entry_path.join("meta.json");
            
            if up_sql.exists() {
                let up_content = fs::read_to_string(&up_sql).ok();
                let down_content = fs::read_to_string(&down_sql).ok();
                let meta_content = fs::read_to_string(&meta_json).ok();
                
                let meta: Option<serde_json::Value> = meta_content
                    .and_then(|c| serde_json::from_str(&c).ok());
                
                migrations.push(serde_json::json!({
                    "name": dir_name,
                    "path": entry_path.to_string_lossy(),
                    "up_sql": up_content,
                    "down_sql": down_content,
                    "meta": meta,
                }));
            }
        }
    }
    
    // Sort by name (timestamp)
    migrations.sort_by(|a, b| {
        let name_a = a.get("name").and_then(|v| v.as_str()).unwrap_or("");
        let name_b = b.get("name").and_then(|v| v.as_str()).unwrap_or("");
        name_b.cmp(name_a) // Newest first
    });
    
    Ok(migrations)
}

// ===================== SCHEMA VERSIONING =====================

const VERSIONS_FILE: &str = "schema_versions.json";

fn get_versions_path(base_path: &str) -> std::path::PathBuf {
    Path::new(base_path).join(VERSIONS_FILE)
}

fn load_versions(base_path: &str) -> Result<Vec<SchemaVersion>, String> {
    let path = get_versions_path(base_path);
    if !path.exists() {
        return Ok(Vec::new());
    }
    
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read versions file: {}", e))?;
    
    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse versions file: {}", e))
}

fn save_versions(base_path: &str, versions: &[SchemaVersion]) -> Result<(), String> {
    let path = get_versions_path(base_path);
    let parent = path.parent().ok_or("Invalid path")?;
    
    if !parent.exists() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    
    let content = serde_json::to_string_pretty(versions)
        .map_err(|e| format!("Failed to serialize versions: {}", e))?;
    
    fs::write(&path, content)
        .map_err(|e| format!("Failed to write versions file: {}", e))
}

/// Save a schema version snapshot
#[tauri::command]
pub async fn save_schema_version(
    connection_string: String,
    name: String,
    description: String,
    tags: Vec<String>,
    base_path: String,
) -> Result<SchemaVersion, String> {
    // Introspect current schema
    let pool = connect::create_pool(&connection_string)
        .await
        .map_err(|e| format!("Failed to connect: {}", e))?;
    
    let schema = db_introspect::introspect_schema(&pool)
        .await
        .map_err(|e| format!("Introspection failed: {}", e))?;
    
    // Get database name
    let db_row = sqlx::query("SELECT current_database() as db_name")
        .fetch_one(&pool)
        .await
        .map_err(|e| format!("Failed to get database name: {}", e))?;
    let database_name: String = db_row.get("db_name");
    
    let version = SchemaVersion {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        description,
        connection_string: connection_string.clone(),
        database_name,
        schema,
        created_at: Utc::now().to_rfc3339(),
        tags,
    };
    
    // Load existing versions and add new one
    let mut versions = load_versions(&base_path)?;
    versions.push(version.clone());
    save_versions(&base_path, &versions)?;
    
    Ok(version)
}

/// List all schema versions
#[tauri::command]
pub async fn list_schema_versions(base_path: String) -> Result<Vec<SchemaVersion>, String> {
    load_versions(&base_path)
}

/// Get a specific schema version by ID
#[tauri::command]
pub async fn get_schema_version(base_path: String, version_id: String) -> Result<SchemaVersion, String> {
    let versions = load_versions(&base_path)?;
    versions.into_iter()
        .find(|v| v.id == version_id)
        .ok_or_else(|| format!("Version not found: {}", version_id))
}

/// Delete a schema version
#[tauri::command]
pub async fn delete_schema_version(base_path: String, version_id: String) -> Result<(), String> {
    let mut versions = load_versions(&base_path)?;
    versions.retain(|v| v.id != version_id);
    save_versions(&base_path, &versions)
}

/// Compare two schema versions
#[tauri::command]
pub async fn compare_schema_versions(
    base_path: String,
    from_version_id: String,
    to_version_id: String,
) -> Result<VersionDiff, String> {
    let versions = load_versions(&base_path)?;
    
    let from_version = versions.iter()
        .find(|v| v.id == from_version_id)
        .ok_or_else(|| format!("From version not found: {}", from_version_id))?;
    
    let to_version = versions.iter()
        .find(|v| v.id == to_version_id)
        .ok_or_else(|| format!("To version not found: {}", to_version_id))?;
    
    let diff_report = diff_engine::compare_schemas(&to_version.schema, &from_version.schema);
    
    Ok(VersionDiff {
        from_version: from_version_id,
        to_version: to_version_id,
        diff_report,
    })
}

/// Compare a schema version with current live database
#[tauri::command]
pub async fn compare_version_with_live(
    base_path: String,
    version_id: String,
    connection_string: String,
) -> Result<DiffReport, String> {
    let versions = load_versions(&base_path)?;
    
    let version = versions.iter()
        .find(|v| v.id == version_id)
        .ok_or_else(|| format!("Version not found: {}", version_id))?;
    
    // Get live schema
    let pool = connect::create_pool(&connection_string)
        .await
        .map_err(|e| format!("Failed to connect: {}", e))?;
    
    let live_schema = db_introspect::introspect_schema(&pool)
        .await
        .map_err(|e| format!("Introspection failed: {}", e))?;
    
    Ok(diff_engine::compare_schemas(&version.schema, &live_schema))
}
