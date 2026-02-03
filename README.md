# 🐘 PGShift

**PostgreSQL Schema Migration Tool** - A modern desktop application for managing PostgreSQL database schema migrations with visual diff comparison.

![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

## 📥 Downloads

**[⬇️ Download Latest Release](https://github.com/ervsoft/pgshift/releases)**

| Platform | File |
|----------|------|
| macOS (Intel/Apple Silicon) | `PGShift_x.x.x_x64.dmg` |
| Windows x64 | `PGShift_x.x.x_x64-setup.exe` |

## ✨ Features

- **🔌 Multi-Connection Support**: Connect to multiple source and target databases simultaneously
- **🔍 Visual Schema Comparison**: Compare schemas between databases with detailed diff view
- **📦 Migration Generation**: Automatically generate SQL migration scripts
- **⚡ Multi-Target Deployment**: Apply migrations to multiple databases at once
- **🗄️ Database Browser**: Explore tables, columns, indexes, and constraints
- **📚 Version History**: Track and manage migration versions
- **🔀 Schema Merging**: Merge multiple source schemas into a unified target

## 🚀 Quick Start

### 1. Installation

**macOS:**
1. Download the `.dmg` file
2. Open the DMG and drag PGShift to Applications
3. On first run, right-click and select "Open" to bypass Gatekeeper

**Windows:**
1. Download the `.exe` installer
2. Run the installer and follow the prompts
3. Launch PGShift from Start Menu

### 2. Connect to Databases

1. Open PGShift and go to **Connections** tab
2. Enter your **Source** database credentials (desired schema state)
3. Enter your **Target** database credentials (current production state)
4. Click **Test Connection** to verify both connections

#### Multi-Connection Mode

For advanced scenarios:
1. Toggle to **Multi Mode** in the Connections page
2. Add multiple source databases to merge their schemas
3. Add multiple target databases for batch migration deployment

### 3. Compare Schemas

1. Navigate to the **Compare** tab
2. Click **Compare Schemas** (or **Merge & Compare** in multi-mode)
3. Review the differences in the visual diff tree
4. Click on any item to see detailed changes

### 4. Generate Migration

1. After comparison, enter a migration name (e.g., `add_users_table`)
2. Click **Generate Migration**
3. Review the generated SQL in the preview panel

### 5. Apply Migration

1. Go to the **Apply** tab
2. Select the migration path (auto-filled from generation)
3. Review the warning about destructive operations
4. Click **Apply Migration**

For multi-target deployment:
1. Switch to **Multi Target** mode
2. Click **Apply to All** to deploy to all connected targets

## 📖 Usage Guide

### Connection String Format

```
postgres://username:password@hostname:port/database_name
```

**Examples:**
- `postgres://postgres:secret@localhost:5432/myapp_dev`
- `postgres://admin:pass123@db.example.com:5432/production`

### Database Browser

The Browser tab provides a complete view of your database:
- **Tables**: View all tables with columns, types, and constraints
- **Indexes**: See all indexes and their configurations
- **Enums**: Browse custom PostgreSQL enum types
- **Query Editor**: Run custom SQL queries

### Migration Workflow

```
Source DB (desired state)     Target DB (current state)
        │                              │
        └──────────┬───────────────────┘
                   │
           Compare Schemas
                   │
           Generate Migration
                   │
           Review SQL Changes
                   │
           Apply to Target(s)
```

## 🛠️ Development

### Prerequisites

- Node.js 18+
- Rust 1.70+
- pnpm

### Setup

```bash
cd pgshift
pnpm install
pnpm tauri dev
```

### Build

```bash
# macOS DMG
pnpm tauri build --bundles dmg

# Windows EXE (requires Windows or CI)
pnpm tauri build --bundles nsis
```

### CI/CD Releases

This project uses GitHub Actions for automated builds:

1. Push a version tag: `git tag v0.2.0 && git push --tags`
2. GitHub Actions builds both macOS DMG and Windows EXE
3. Artifacts are uploaded to GitHub Releases automatically

See [.github/workflows/release.yml](.github/workflows/release.yml) for configuration.

## 📋 Changelog

See [CHANGELOG.md](./CHANGELOG.md) for version history.

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## 📄 License

MIT License - see [LICENSE](./LICENSE) for details.

---

Made with ❤️ using [Tauri](https://tauri.app), [React](https://react.dev), and [Rust](https://rust-lang.org)
