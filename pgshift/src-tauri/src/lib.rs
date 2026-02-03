//! PGShift - PostgreSQL Schema Migration Tool
//! 
//! This library provides the core functionality for comparing PostgreSQL schemas
//! and generating migration files.

pub mod commands;
pub mod db;
pub mod model;
pub mod diff;
pub mod render;
pub mod apply;

pub use commands::*;
