# Changelog

All notable changes to PGShift will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-02-03

### Added
- Initial release
- Database connection management (single and multi-mode)
- Schema comparison with visual diff tree
- Migration generation with SQL preview
- Multi-target migration deployment
- Database browser with table/column/index exploration
- Version history tracking
- Query editor in browser tab
- Saved connections with local storage
- ENUM type support with proper quoting
- Index management and comparison

### Features
- **Connections Page**: Connect to PostgreSQL databases with field-based or connection string input
- **Multi-Mode**: Add multiple sources for schema merging, multiple targets for batch deployment
- **Compare Page**: Visual schema comparison with detailed diff view
- **Migrations Page**: View and manage generated migrations
- **Browser Page**: Explore database structure, run queries
- **Versions Page**: Track migration history
- **Apply Page**: Execute migrations with logging

### Technical
- Built with Tauri v2.10.0
- React 18 + TypeScript + Vite 5
- Rust backend with sqlx 0.7.4
- macOS DMG and Windows NSIS installer support
