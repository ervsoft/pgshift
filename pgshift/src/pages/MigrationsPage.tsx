import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { Migration, DiffReport } from '../types';

interface MigrationsPageProps {
  diffReport: DiffReport | null;
  setError: (error: string | null) => void;
}

function MigrationsPage({ diffReport, setError }: MigrationsPageProps) {
  const [migrations, setMigrations] = useState<Migration[]>([]);
  const [basePath, setBasePath] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedMigration, setSelectedMigration] = useState<Migration | null>(null);
  
  // Export form state
  const [showExportForm, setShowExportForm] = useState(false);
  const [exportName, setExportName] = useState('');
  const [exportPath, setExportPath] = useState('');
  const [exporting, setExporting] = useState(false);

  const loadMigrations = useCallback(async () => {
    if (!basePath) return;
    
    setLoading(true);
    try {
      const result = await invoke<Migration[]>('list_migrations', { basePath });
      setMigrations(result);
      setError(null);
    } catch (err) {
      setError(`Failed to load migrations: ${err}`);
    } finally {
      setLoading(false);
    }
  }, [basePath, setError]);

  useEffect(() => {
    invoke<string>('get_migrations_dir').then((dir) => {
      setBasePath(dir);
      setExportPath(dir);
    });
  }, []);

  useEffect(() => {
    if (basePath) {
      loadMigrations();
    }
  }, [basePath, loadMigrations]);

  const selectBasePath = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Migrations Directory',
      });
      
      if (selected && typeof selected === 'string') {
        setBasePath(selected);
      }
    } catch (err) {
      setError(`Failed to select directory: ${err}`);
    }
  };

  const selectExportPath = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Export Directory',
      });
      
      if (selected && typeof selected === 'string') {
        setExportPath(selected);
      }
    } catch (err) {
      setError(`Failed to select directory: ${err}`);
    }
  };

  const exportMigration = async () => {
    if (!diffReport) {
      setError('No diff report to export. Run a comparison first.');
      return;
    }
    
    if (!exportName.trim()) {
      setError('Migration name is required');
      return;
    }
    
    if (!exportPath.trim()) {
      setError('Export path is required');
      return;
    }
    
    setExporting(true);
    try {
      const result = await invoke<string>('export_migration', {
        report: diffReport,
        name: exportName.trim(),
        exportPath: exportPath.trim(),
      });
      
      setShowExportForm(false);
      setExportName('');
      loadMigrations();
      setError(null);
      alert(`Migration exported successfully to:\n${result}`);
    } catch (err) {
      setError(`Failed to export migration: ${err}`);
    } finally {
      setExporting(false);
    }
  };

  const downloadMigrationFile = async (migration: Migration, fileType: 'up' | 'down') => {
    const content = fileType === 'up' ? migration.up_sql : migration.down_sql;
    if (!content) {
      setError(`No ${fileType}.sql file in this migration`);
      return;
    }
    
    try {
      const savePath = await save({
        defaultPath: `${migration.name}_${fileType}.sql`,
        filters: [{ name: 'SQL Files', extensions: ['sql'] }],
      });
      
      if (savePath) {
        await writeTextFile(savePath, content);
        setError(null);
      }
    } catch (err) {
      setError(`Failed to save file: ${err}`);
    }
  };

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return 'Unknown';
    return new Date(dateStr).toLocaleString();
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2>📦 Migrations</h2>
        <p>View, export, and manage your database migration files.</p>
      </div>

      {/* Path Selector */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="path-selector">
          <label>Migrations Directory:</label>
          <input
            type="text"
            className="input"
            value={basePath}
            onChange={(e) => setBasePath(e.target.value)}
            placeholder="/path/to/migrations"
          />
          <button className="btn btn-secondary" onClick={selectBasePath}>
            📁 Browse
          </button>
          <button className="btn btn-secondary" onClick={loadMigrations} disabled={loading}>
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Export Button */}
      <div className="actions-bar" style={{ marginBottom: '1rem' }}>
        <button 
          className="btn btn-primary"
          onClick={() => setShowExportForm(true)}
          disabled={!diffReport}
        >
          📤 Export Current Diff
        </button>
        {!diffReport && (
          <span style={{ color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>
            (Run a comparison first to export)
          </span>
        )}
      </div>

      {/* Export Form */}
      {showExportForm && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h3 className="card-title">📤 Export Migration</h3>
          <div className="form-grid">
            <div className="form-group">
              <label>Migration Name *</label>
              <input
                type="text"
                className="input"
                value={exportName}
                onChange={(e) => setExportName(e.target.value)}
                placeholder="e.g., add-users-table, v2-schema-update"
              />
            </div>
            <div className="form-group">
              <label>Export Directory</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  className="input"
                  value={exportPath}
                  onChange={(e) => setExportPath(e.target.value)}
                  placeholder="/path/to/export"
                  style={{ flex: 1 }}
                />
                <button className="btn btn-secondary" onClick={selectExportPath}>
                  📁
                </button>
              </div>
            </div>
          </div>
          
          {diffReport && (
            <div className="export-preview" style={{ marginTop: '1rem' }}>
              <h4>Migration Summary:</h4>
              <p>{diffReport.items.length} changes will be exported</p>
              <ul>
                {diffReport.items.slice(0, 5).map((item) => (
                  <li key={item.id}>
                    {item.kind} {item.object_type}: {item.object_name}
                  </li>
                ))}
                {diffReport.items.length > 5 && (
                  <li>... and {diffReport.items.length - 5} more</li>
                )}
              </ul>
            </div>
          )}
          
          <div className="form-actions" style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-primary" onClick={exportMigration} disabled={exporting}>
              {exporting ? '⏳ Exporting...' : '📤 Export'}
            </button>
            <button className="btn btn-secondary" onClick={() => setShowExportForm(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Migrations List */}
      <div className="migrations-list">
        {loading ? (
          <div className="card">
            <div className="loading-state">Loading migrations...</div>
          </div>
        ) : migrations.length === 0 ? (
          <div className="card">
            <div className="empty-state" style={{ textAlign: 'center', padding: '2rem' }}>
              <p>📭 No migrations found in this directory.</p>
              <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                Export a migration from a comparison to create one.
              </p>
            </div>
          </div>
        ) : (
          migrations.map((migration) => (
            <div 
              key={migration.name} 
              className={`card migration-card ${selectedMigration?.name === migration.name ? 'selected' : ''}`}
            >
              <div className="migration-header" onClick={() => setSelectedMigration(
                selectedMigration?.name === migration.name ? null : migration
              )}>
                <div className="migration-icon">📄</div>
                <div className="migration-info">
                  <h4 className="migration-name">{migration.name}</h4>
                  <div className="migration-meta">
                    {migration.meta?.generated_at && (
                      <span className="migration-date">📅 {formatDate(migration.meta.generated_at)}</span>
                    )}
                    {migration.meta?.change_count !== undefined && (
                      <span className="migration-changes">🔄 {migration.meta.change_count} changes</span>
                    )}
                  </div>
                </div>
                <div className="migration-actions">
                  <button
                    className="btn btn-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      downloadMigrationFile(migration, 'up');
                    }}
                    disabled={!migration.up_sql}
                    title="Download up.sql"
                  >
                    ⬆️ up.sql
                  </button>
                  <button
                    className="btn btn-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      downloadMigrationFile(migration, 'down');
                    }}
                    disabled={!migration.down_sql}
                    title="Download down.sql"
                  >
                    ⬇️ down.sql
                  </button>
                </div>
              </div>
              
              {/* Expanded Content */}
              {selectedMigration?.name === migration.name && (
                <div className="migration-content" style={{ marginTop: '1rem' }}>
                  {migration.up_sql && (
                    <div className="sql-section">
                      <h5>⬆️ up.sql</h5>
                      <pre className="sql-preview">{migration.up_sql}</pre>
                    </div>
                  )}
                  {migration.down_sql && (
                    <div className="sql-section" style={{ marginTop: '1rem' }}>
                      <h5>⬇️ down.sql</h5>
                      <pre className="sql-preview">{migration.down_sql}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default MigrationsPage;
