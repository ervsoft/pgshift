//! PostgreSQL connection management.

use sqlx::postgres::{PgPool, PgPoolOptions};
use sqlx::Error;

/// Test a PostgreSQL connection by attempting to connect and executing a simple query.
pub async fn test_connection(connection_string: &str) -> Result<(), Error> {
    let pool = PgPoolOptions::new()
        .max_connections(1)
        .connect(connection_string)
        .await?;
    
    // Execute a simple query to verify connection
    sqlx::query("SELECT 1")
        .execute(&pool)
        .await?;
    
    pool.close().await;
    Ok(())
}

/// Create a connection pool to the PostgreSQL database.
pub async fn create_pool(connection_string: &str) -> Result<PgPool, Error> {
    PgPoolOptions::new()
        .max_connections(5)
        .connect(connection_string)
        .await
}
