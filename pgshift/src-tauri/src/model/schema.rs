//! Schema model types for representing PostgreSQL schema objects.

use serde::{Deserialize, Serialize};

/// Represents a PostgreSQL ENUM type.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EnumType {
    pub name: String,
    pub values: Vec<String>,
}

/// Represents the entire schema model for a database.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SchemaModel {
    pub tables: Vec<Table>,
    pub indexes: Vec<Index>,
    #[serde(default)]
    pub enums: Vec<EnumType>,
}

impl SchemaModel {
    pub fn new() -> Self {
        Self { tables: Vec::new(), indexes: Vec::new(), enums: Vec::new() }
    }
    
    pub fn find_table(&self, name: &str) -> Option<&Table> {
        self.tables.iter().find(|t| t.name == name)
    }
    
    pub fn find_enum(&self, name: &str) -> Option<&EnumType> {
        self.enums.iter().find(|e| e.name == name)
    }
}

impl Default for SchemaModel {
    fn default() -> Self {
        Self::new()
    }
}

/// Represents a database table.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Table {
    pub name: String,
    pub columns: Vec<Column>,
    pub primary_key: Option<Constraint>,
    pub unique_constraints: Vec<Constraint>,
    pub indexes: Vec<Index>,
}

impl Table {
    pub fn find_column(&self, name: &str) -> Option<&Column> {
        self.columns.iter().find(|c| c.name == name)
    }
    
    pub fn find_constraint(&self, name: &str) -> Option<&Constraint> {
        if let Some(pk) = &self.primary_key {
            if pk.name == name {
                return Some(pk);
            }
        }
        self.unique_constraints.iter().find(|c| c.name == name)
    }
    
    pub fn find_index(&self, name: &str) -> Option<&Index> {
        self.indexes.iter().find(|i| i.name == name)
    }
}

/// Represents a table column.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Column {
    pub name: String,
    pub data_type: String,
    pub is_nullable: bool,
    pub default_value: Option<String>,
    pub ordinal_position: i32,
}

impl Column {
    /// Check if two columns have the same definition (ignoring ordinal position).
    pub fn same_definition(&self, other: &Column) -> bool {
        self.name == other.name
            && self.data_type == other.data_type
            && self.is_nullable == other.is_nullable
            && self.default_value == other.default_value
    }
}

/// Represents a constraint (PRIMARY KEY or UNIQUE).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Constraint {
    pub name: String,
    pub constraint_type: String,
    pub columns: Vec<String>,
}

/// Represents an index.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Index {
    pub name: String,
    pub columns: Vec<String>,
    pub is_unique: bool,
    pub index_type: String,
}
