//! SQL rendering for migration files.

use std::fs;
use std::path::Path;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use crate::diff::DiffReport;

/// Metadata for a migration.
#[derive(Debug, Serialize, Deserialize)]
pub struct MigrationMeta {
    pub name: String,
    pub timestamp: String,
    pub generated_at: String,
    pub items_count: usize,
    pub has_dangerous: bool,
    pub items: Vec<MigrationItemMeta>,
}

/// Metadata for a single migration item.
#[derive(Debug, Serialize, Deserialize)]
pub struct MigrationItemMeta {
    pub id: String,
    pub kind: String,
    pub object_type: String,
    pub object_name: String,
    pub dangerous: bool,
}

/// Render migration files to disk.
pub fn render_migration_files(
    report: &DiffReport,
    name: &str,
    base_path: &str,
) -> Result<String, std::io::Error> {
    let timestamp = Utc::now().format("%Y%m%d%H%M%S").to_string();
    let sanitized_name = sanitize_name(name);
    let folder_name = format!("{}__{}", timestamp, sanitized_name);
    
    let migration_dir = Path::new(base_path).join(&folder_name);
    fs::create_dir_all(&migration_dir)?;
    
    // Generate UP SQL
    let up_sql = generate_up_sql(report);
    fs::write(migration_dir.join("up.sql"), &up_sql)?;
    
    // Generate DOWN SQL
    let down_sql = generate_down_sql(report);
    fs::write(migration_dir.join("down.sql"), &down_sql)?;
    
    // Generate metadata
    let meta = MigrationMeta {
        name: sanitized_name.clone(),
        timestamp: timestamp.clone(),
        generated_at: Utc::now().to_rfc3339(),
        items_count: report.items.len(),
        has_dangerous: report.has_dangerous(),
        items: report
            .items
            .iter()
            .map(|item| MigrationItemMeta {
                id: item.id.clone(),
                kind: format!("{:?}", item.kind).to_lowercase(),
                object_type: item.object_type.clone(),
                object_name: item.object_name.clone(),
                dangerous: item.dangerous,
            })
            .collect(),
    };
    
    let meta_json = serde_json::to_string_pretty(&meta)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    fs::write(migration_dir.join("meta.json"), &meta_json)?;
    
    Ok(migration_dir.to_string_lossy().to_string())
}

/// Generate the UP SQL migration script.
fn generate_up_sql(report: &DiffReport) -> String {
    let mut parts = Vec::new();
    
    parts.push("-- Migration UP Script".to_string());
    parts.push(format!("-- Generated at: {}", Utc::now().to_rfc3339()));
    parts.push("-- This script applies the schema changes to the target database.\n".to_string());
    
    parts.push("BEGIN;\n".to_string());
    
    // Group items by type for better organization
    // IMPORTANT: ENUMs must be created FIRST, before tables that use them
    let enums_added: Vec<_> = report.items.iter()
        .filter(|i| i.object_type == "enum" && matches!(i.kind, crate::diff::DiffKind::Added))
        .collect();
    
    let enums_modified: Vec<_> = report.items.iter()
        .filter(|i| i.object_type == "enum" && matches!(i.kind, crate::diff::DiffKind::Modified))
        .collect();
    
    let enums_removed: Vec<_> = report.items.iter()
        .filter(|i| i.object_type == "enum" && matches!(i.kind, crate::diff::DiffKind::Removed))
        .collect();
    
    let tables_added: Vec<_> = report.items.iter()
        .filter(|i| i.object_type == "table" && matches!(i.kind, crate::diff::DiffKind::Added))
        .collect();
    
    let tables_removed: Vec<_> = report.items.iter()
        .filter(|i| i.object_type == "table" && matches!(i.kind, crate::diff::DiffKind::Removed))
        .collect();
    
    let columns: Vec<_> = report.items.iter()
        .filter(|i| i.object_type == "column")
        .collect();
    
    let constraints: Vec<_> = report.items.iter()
        .filter(|i| i.object_type == "constraint")
        .collect();
    
    let indexes: Vec<_> = report.items.iter()
        .filter(|i| i.object_type == "index")
        .collect();
    
    // ENUM types MUST be created FIRST (before tables that use them)
    if !enums_added.is_empty() {
        parts.push("-- Create enum types (must be before tables)".to_string());
        for item in &enums_added {
            parts.push(format!("-- {}", item.details));
            parts.push(item.generated_up_sql.clone());
        }
        parts.push(String::new());
    }
    
    // Modify existing ENUMs (add values)
    if !enums_modified.is_empty() {
        parts.push("-- Modify enum types".to_string());
        for item in &enums_modified {
            parts.push(format!("-- {}", item.details));
            if item.dangerous {
                parts.push("-- ⚠️  DANGEROUS: Removing ENUM values may cause data issues".to_string());
            }
            parts.push(item.generated_up_sql.clone());
        }
        parts.push(String::new());
    }
    
    // Add tables
    if !tables_added.is_empty() {
        parts.push("-- Create new tables".to_string());
        for item in &tables_added {
            parts.push(format!("-- {}", item.details));
            parts.push(item.generated_up_sql.clone());
        }
        parts.push(String::new());
    }
    
    // Add columns
    if !columns.is_empty() {
        parts.push("-- Column changes".to_string());
        for item in &columns {
            parts.push(format!("-- {}", item.details));
            if item.dangerous {
                parts.push("-- ⚠️  DANGEROUS: This operation may cause data loss".to_string());
            }
            parts.push(item.generated_up_sql.clone());
        }
        parts.push(String::new());
    }
    
    // Add constraints
    if !constraints.is_empty() {
        parts.push("-- Constraint changes".to_string());
        for item in &constraints {
            parts.push(format!("-- {}", item.details));
            parts.push(item.generated_up_sql.clone());
        }
        parts.push(String::new());
    }
    
    // Add indexes
    if !indexes.is_empty() {
        parts.push("-- Index changes".to_string());
        for item in &indexes {
            parts.push(format!("-- {}", item.details));
            parts.push(item.generated_up_sql.clone());
        }
        parts.push(String::new());
    }
    
    // Drop ENUMs after tables that use them are dropped
    if !enums_removed.is_empty() {
        parts.push("-- Drop enum types".to_string());
        for item in &enums_removed {
            parts.push(format!("-- {}", item.details));
            parts.push("-- ⚠️  DANGEROUS: This will fail if the type is still in use".to_string());
            parts.push(item.generated_up_sql.clone());
        }
        parts.push(String::new());
    }
    
    // Drop tables last
    if !tables_removed.is_empty() {
        parts.push("-- Drop tables".to_string());
        for item in &tables_removed {
            parts.push(format!("-- {}", item.details));
            parts.push("-- ⚠️  DANGEROUS: This operation will permanently delete data".to_string());
            parts.push(item.generated_up_sql.clone());
        }
        parts.push(String::new());
    }
    
    parts.push("COMMIT;".to_string());
    
    parts.join("\n")
}

/// Generate the DOWN SQL migration script (rollback).
fn generate_down_sql(report: &DiffReport) -> String {
    let mut parts = Vec::new();
    
    parts.push("-- Migration DOWN Script (Rollback)".to_string());
    parts.push(format!("-- Generated at: {}", Utc::now().to_rfc3339()));
    parts.push("-- This script reverts the schema changes.\n".to_string());
    
    parts.push("BEGIN;\n".to_string());
    
    // Reverse order: indexes, constraints, columns, tables
    let items_reversed: Vec<_> = report.items.iter().rev().collect();
    
    for item in items_reversed {
        parts.push(format!("-- Revert: {}", item.details));
        parts.push(item.generated_down_sql.clone());
    }
    
    parts.push("\nCOMMIT;".to_string());
    
    parts.join("\n")
}

/// Sanitize the migration name for use in filenames.
fn sanitize_name(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_alphanumeric() || c == '_' || c == '-' { c } else { '_' })
        .collect::<String>()
        .to_lowercase()
}
