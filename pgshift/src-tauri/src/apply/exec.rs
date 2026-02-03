//! Migration execution logic.

use std::fs;
use std::path::Path;
use sqlx::postgres::PgPool;
use chrono::Utc;

/// Apply a migration SQL file to the database.
pub async fn apply_migration_sql(
    pool: &PgPool,
    migration_path: &str,
) -> Result<Vec<String>, String> {
    let mut logs = Vec::new();
    
    let path = Path::new(migration_path);
    let up_sql_path = path.join("up.sql");
    
    if !up_sql_path.exists() {
        return Err(format!("Migration file not found: {:?}", up_sql_path));
    }
    
    logs.push(format!("[{}] Starting migration from: {}", timestamp(), migration_path));
    
    let sql = fs::read_to_string(&up_sql_path)
        .map_err(|e| format!("Failed to read migration file: {}", e))?;
    
    logs.push(format!("[{}] Read migration file ({} bytes)", timestamp(), sql.len()));
    
    // Execute the SQL
    logs.push(format!("[{}] Executing migration...", timestamp()));
    
    match sqlx::raw_sql(&sql).execute(pool).await {
        Ok(result) => {
            logs.push(format!(
                "[{}] Migration executed successfully. Rows affected: {}",
                timestamp(),
                result.rows_affected()
            ));
        }
        Err(e) => {
            logs.push(format!("[{}] Migration FAILED: {}", timestamp(), e));
            return Err(format!("Migration execution failed: {}", e));
        }
    }
    
    logs.push(format!("[{}] Migration completed successfully", timestamp()));
    
    Ok(logs)
}

/// Get current timestamp for logging.
fn timestamp() -> String {
    Utc::now().format("%H:%M:%S%.3f").to_string()
}
