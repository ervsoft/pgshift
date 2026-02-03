//! PostgreSQL schema introspection.

use sqlx::postgres::PgPool;
use sqlx::Row;
use crate::model::schema::{SchemaModel, Table, Column, Constraint, Index, EnumType};

/// Introspect the public schema of a PostgreSQL database.
pub async fn introspect_schema(pool: &PgPool) -> Result<SchemaModel, sqlx::Error> {
    // Get ENUM types first
    let enums = get_enums(pool).await?;
    
    let tables = get_tables(pool).await?;
    
    let mut result_tables = Vec::new();
    let mut all_indexes = Vec::new();
    
    for table_name in tables {
        let columns = get_columns(pool, &table_name).await?;
        let primary_key = get_primary_key(pool, &table_name).await?;
        let unique_constraints = get_unique_constraints(pool, &table_name).await?;
        let indexes = get_indexes(pool, &table_name).await?;
        
        // Collect all indexes for the schema-level list
        for idx in &indexes {
            all_indexes.push(idx.clone());
        }
        
        result_tables.push(Table {
            name: table_name,
            columns,
            primary_key,
            unique_constraints,
            indexes,
        });
    }
    
    Ok(SchemaModel { tables: result_tables, indexes: all_indexes, enums })
}

/// Get all ENUM types in the public schema.
async fn get_enums(pool: &PgPool) -> Result<Vec<EnumType>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT 
            t.typname as enum_name,
            array_agg(e.enumlabel ORDER BY e.enumsortorder) as enum_values
        FROM pg_type t 
        JOIN pg_enum e ON t.oid = e.enumtypid  
        JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
        GROUP BY t.typname
        ORDER BY t.typname
        "#
    )
    .fetch_all(pool)
    .await?;
    
    Ok(rows.iter().map(|r| {
        let name: String = r.get("enum_name");
        let values: Vec<String> = r.get("enum_values");
        EnumType { name, values }
    }).collect())
}

/// Get all table names in the public schema.
async fn get_tables(pool: &PgPool) -> Result<Vec<String>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_type = 'BASE TABLE'
        ORDER BY table_name
        "#
    )
    .fetch_all(pool)
    .await?;
    
    Ok(rows.iter().map(|r| r.get::<String, _>("table_name")).collect())
}

/// Get all columns for a table.
async fn get_columns(pool: &PgPool, table_name: &str) -> Result<Vec<Column>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT 
            column_name,
            data_type,
            udt_name,
            is_nullable,
            column_default,
            ordinal_position,
            character_maximum_length,
            numeric_precision,
            numeric_scale
        FROM information_schema.columns
        WHERE table_schema = 'public' 
          AND table_name = $1
        ORDER BY ordinal_position
        "#
    )
    .bind(table_name)
    .fetch_all(pool)
    .await?;
    
    Ok(rows.iter().map(|r| {
        let data_type: String = r.get("data_type");
        let udt_name: String = r.get("udt_name");
        let char_max_len: Option<i32> = r.get("character_maximum_length");
        let numeric_precision: Option<i32> = r.get("numeric_precision");
        let numeric_scale: Option<i32> = r.get("numeric_scale");
        
        // Build full data type with precision/length
        let full_data_type = build_full_data_type(&data_type, &udt_name, char_max_len, numeric_precision, numeric_scale);
        
        Column {
            name: r.get("column_name"),
            data_type: full_data_type,
            is_nullable: r.get::<String, _>("is_nullable") == "YES",
            default_value: r.get("column_default"),
            ordinal_position: r.get("ordinal_position"),
        }
    }).collect())
}

/// Build full data type string with precision/length information.
fn build_full_data_type(
    data_type: &str,
    udt_name: &str,
    char_max_len: Option<i32>,
    numeric_precision: Option<i32>,
    numeric_scale: Option<i32>,
) -> String {
    match data_type {
        "character varying" => {
            if let Some(len) = char_max_len {
                format!("varchar({})", len)
            } else {
                "varchar".to_string()
            }
        }
        "character" => {
            if let Some(len) = char_max_len {
                format!("char({})", len)
            } else {
                "char".to_string()
            }
        }
        "numeric" => {
            match (numeric_precision, numeric_scale) {
                (Some(p), Some(s)) if s > 0 => format!("numeric({},{})", p, s),
                (Some(p), _) => format!("numeric({})", p),
                _ => "numeric".to_string(),
            }
        }
        "ARRAY" => format!("{}[]", udt_name.trim_start_matches('_')),
        "USER-DEFINED" => udt_name.to_string(),
        _ => data_type.to_string(),
    }
}

/// Get the primary key constraint for a table.
async fn get_primary_key(pool: &PgPool, table_name: &str) -> Result<Option<Constraint>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT
            tc.constraint_name,
            kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
        WHERE tc.table_schema = 'public'
          AND tc.table_name = $1
          AND tc.constraint_type = 'PRIMARY KEY'
        ORDER BY kcu.ordinal_position
        "#
    )
    .bind(table_name)
    .fetch_all(pool)
    .await?;
    
    if rows.is_empty() {
        return Ok(None);
    }
    
    let constraint_name: String = rows[0].get("constraint_name");
    let columns: Vec<String> = rows.iter().map(|r| r.get("column_name")).collect();
    
    Ok(Some(Constraint {
        name: constraint_name,
        constraint_type: "PRIMARY KEY".to_string(),
        columns,
    }))
}

/// Get unique constraints for a table.
async fn get_unique_constraints(pool: &PgPool, table_name: &str) -> Result<Vec<Constraint>, sqlx::Error> {
    let constraint_names: Vec<String> = sqlx::query(
        r#"
        SELECT DISTINCT tc.constraint_name
        FROM information_schema.table_constraints tc
        WHERE tc.table_schema = 'public'
          AND tc.table_name = $1
          AND tc.constraint_type = 'UNIQUE'
        ORDER BY tc.constraint_name
        "#
    )
    .bind(table_name)
    .fetch_all(pool)
    .await?
    .iter()
    .map(|r| r.get("constraint_name"))
    .collect();
    
    let mut constraints = Vec::new();
    
    for constraint_name in constraint_names {
        let columns: Vec<String> = sqlx::query(
            r#"
            SELECT kcu.column_name
            FROM information_schema.key_column_usage kcu
            WHERE kcu.table_schema = 'public'
              AND kcu.table_name = $1
              AND kcu.constraint_name = $2
            ORDER BY kcu.ordinal_position
            "#
        )
        .bind(table_name)
        .bind(&constraint_name)
        .fetch_all(pool)
        .await?
        .iter()
        .map(|r| r.get("column_name"))
        .collect();
        
        constraints.push(Constraint {
            name: constraint_name,
            constraint_type: "UNIQUE".to_string(),
            columns,
        });
    }
    
    Ok(constraints)
}

/// Get indexes for a table (excluding primary key and unique constraint indexes).
async fn get_indexes(pool: &PgPool, table_name: &str) -> Result<Vec<Index>, sqlx::Error> {
    let rows = sqlx::query(
        r#"
        SELECT
            i.relname AS index_name,
            am.amname AS index_type,
            ix.indisunique AS is_unique,
            array_agg(a.attname ORDER BY array_position(ix.indkey, a.attnum)) AS columns
        FROM pg_class t
        JOIN pg_index ix ON t.oid = ix.indrelid
        JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN pg_am am ON i.relam = am.oid
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
        JOIN pg_namespace n ON t.relnamespace = n.oid
        WHERE n.nspname = 'public'
          AND t.relname = $1
          AND NOT ix.indisprimary
          AND NOT EXISTS (
              SELECT 1 FROM pg_constraint c
              WHERE c.conindid = ix.indexrelid AND c.contype = 'u'
          )
        GROUP BY i.relname, am.amname, ix.indisunique
        ORDER BY i.relname
        "#
    )
    .bind(table_name)
    .fetch_all(pool)
    .await?;
    
    Ok(rows.iter().map(|r| {
        Index {
            name: r.get("index_name"),
            columns: r.get::<Vec<String>, _>("columns"),
            is_unique: r.get("is_unique"),
            index_type: r.get("index_type"),
        }
    }).collect())
}
