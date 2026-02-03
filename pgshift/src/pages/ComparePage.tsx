import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ConnectionState, SchemaModel, DiffReport, DiffItem } from '../types';
import DiffTree from '../components/DiffTree';
import DiffDetails from '../components/DiffDetails';
import SqlPreview from '../components/SqlPreview';

interface ComparePageProps {
  connections: ConnectionState;
  sourceSchema: SchemaModel | null;
  targetSchema: SchemaModel | null;
  diffReport: DiffReport | null;
  selectedDiffItem: DiffItem | null;
  setSourceSchema: (schema: SchemaModel | null) => void;
  setTargetSchema: (schema: SchemaModel | null) => void;
  setDiffReport: (report: DiffReport | null) => void;
  setSelectedDiffItem: (item: DiffItem | null) => void;
  setMigrationPath: (path: string | null) => void;
  loading: boolean;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  addLog: (message: string) => void;
}

function parseDbName(connStr: string): string {
  try {
    const url = new URL(connStr);
    const db = url.pathname.slice(1);
    const host = url.hostname;
    return `${db}@${host}`;
  } catch {
    return connStr.substring(0, 30) + '...';
  }
}

function parseDbDetails(connStr: string): { host: string; port: string; database: string; user: string } {
  try {
    const url = new URL(connStr);
    return {
      host: url.hostname || 'unknown',
      port: url.port || '5432',
      database: url.pathname.slice(1) || 'unknown',
      user: url.username || 'unknown',
    };
  } catch {
    return { host: 'unknown', port: '5432', database: 'unknown', user: 'unknown' };
  }
}

function ComparePage({
  connections,
  sourceSchema,
  targetSchema,
  diffReport,
  selectedDiffItem,
  setSourceSchema,
  setTargetSchema,
  setDiffReport,
  setSelectedDiffItem,
  setMigrationPath,
  loading,
  setLoading,
  setError,
  addLog,
}: ComparePageProps) {
  const [migrationName, setMigrationName] = useState('');
  const [generatingMigration, setGeneratingMigration] = useState(false);

  const canCompare = connections.sourceConnected && connections.targetConnected;

  const runComparison = async () => {
    if (!canCompare) {
      setError('Please connect to both source and target databases first.');
      return;
    }

    setLoading(true);
    setError(null);
    setDiffReport(null);
    setSelectedDiffItem(null);

    try {
      addLog('Introspecting source database...');
      const source = await invoke<SchemaModel>('introspect', {
        connectionString: connections.source,
      });
      setSourceSchema(source);
      addLog(`Found ${source.tables.length} tables in source`);

      addLog('Introspecting target database...');
      const target = await invoke<SchemaModel>('introspect', {
        connectionString: connections.target,
      });
      setTargetSchema(target);
      addLog(`Found ${target.tables.length} tables in target`);

      addLog('Computing schema differences...');
      const report = await invoke<DiffReport>('diff', { source, target });
      setDiffReport(report);
      addLog(`Found ${report.items.length} differences`);

      if (report.items.length === 0) {
        addLog('Schemas are identical - no migration needed');
      }
    } catch (err) {
      setError(`Comparison failed: ${err}`);
      addLog(`Error: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const generateMigration = async () => {
    if (!diffReport || diffReport.items.length === 0) {
      setError('No differences to generate migration for.');
      return;
    }

    if (!migrationName.trim()) {
      setError('Please enter a migration name.');
      return;
    }

    setGeneratingMigration(true);
    setError(null);

    try {
      const basePath = await invoke<string>('get_migrations_dir');
      addLog(`Generating migration in: ${basePath}`);

      const path = await invoke<string>('render_migration', {
        report: diffReport,
        name: migrationName.trim(),
        basePath,
      });

      setMigrationPath(path);
      addLog(`Migration generated at: ${path}`);
      setError(null);
    } catch (err) {
      setError(`Failed to generate migration: ${err}`);
      addLog(`Error: ${err}`);
    } finally {
      setGeneratingMigration(false);
    }
  };

  const getDiffStats = () => {
    if (!diffReport) return { added: 0, removed: 0, modified: 0, dangerous: 0 };
    
    return {
      added: diffReport.items.filter((i) => i.kind === 'added').length,
      removed: diffReport.items.filter((i) => i.kind === 'removed').length,
      modified: diffReport.items.filter((i) => i.kind === 'modified').length,
      dangerous: diffReport.items.filter((i) => i.dangerous).length,
    };
  };

  const stats = getDiffStats();

  return (
    <div className="page">
      <div className="page-header">
        <h2>Schema Comparison</h2>
        <p>Compare source and target schemas to generate migrations.</p>
      </div>

      <div className="action-bar">
        <button
          className="btn btn-primary"
          onClick={runComparison}
          disabled={loading || !canCompare}
        >
          {loading ? (
            <>
              <span className="spinner"></span>
              Comparing...
            </>
          ) : (
            '🔍 Compare Schemas'
          )}
        </button>

        {!canCompare && (
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', alignSelf: 'center' }}>
            ⚠️ Connect to both databases on the Connections page first
          </span>
        )}
      </div>

      {/* Show connection info when connected but not yet compared */}
      {canCompare && !diffReport && !loading && (
        <div className="connections-preview card" style={{ marginBottom: '1.5rem' }}>
          <h3 className="card-title" style={{ marginBottom: '1rem' }}>🔗 Connected Databases</h3>
          <div className="db-comparison">
            <div className="db-box source">
              <div className="db-label">📤 Source (Desired State)</div>
              <div className="db-name">{parseDbName(connections.source)}</div>
              <div className="db-details">
                {(() => {
                  const details = parseDbDetails(connections.source);
                  return (
                    <>
                      <div className="db-detail-row">
                        <span className="db-detail-label">Host:</span>
                        <span>{details.host}:{details.port}</span>
                      </div>
                      <div className="db-detail-row">
                        <span className="db-detail-label">Database:</span>
                        <span>{details.database}</span>
                      </div>
                      <div className="db-detail-row">
                        <span className="db-detail-label">User:</span>
                        <span>{details.user}</span>
                      </div>
                    </>
                  );
                })()}
              </div>
              <div className="db-status connected">
                <span className="status-dot connected"></span>
                Connected
              </div>
            </div>
            <div className="db-arrow">
              <span>➜</span>
              <span className="arrow-label">will migrate to</span>
            </div>
            <div className="db-box target">
              <div className="db-label">📥 Target (Current State)</div>
              <div className="db-name">{parseDbName(connections.target)}</div>
              <div className="db-details">
                {(() => {
                  const details = parseDbDetails(connections.target);
                  return (
                    <>
                      <div className="db-detail-row">
                        <span className="db-detail-label">Host:</span>
                        <span>{details.host}:{details.port}</span>
                      </div>
                      <div className="db-detail-row">
                        <span className="db-detail-label">Database:</span>
                        <span>{details.database}</span>
                      </div>
                      <div className="db-detail-row">
                        <span className="db-detail-label">User:</span>
                        <span>{details.user}</span>
                      </div>
                    </>
                  );
                })()}
              </div>
              <div className="db-status connected">
                <span className="status-dot connected"></span>
                Connected
              </div>
            </div>
          </div>
          <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Click <strong>"🔍 Compare Schemas"</strong> to analyze differences between these databases.
            </p>
          </div>
        </div>
      )}

      {diffReport && sourceSchema && targetSchema && (
        <>
          {/* Database Comparison Summary */}
          <div className="comparison-summary card" style={{ marginBottom: '1.5rem' }}>
            <h3 className="card-title" style={{ marginBottom: '1rem' }}>📊 Comparison Summary</h3>
            <div className="db-comparison">
              <div className="db-box source">
                <div className="db-label">📤 Source (Desired State)</div>
                <div className="db-name">{parseDbName(connections.source)}</div>
                <div className="db-stats">
                  <span>📋 {sourceSchema.tables.length} tables</span>
                  <span>📇 {sourceSchema.indexes?.length || 0} indexes</span>
                </div>
              </div>
              <div className="db-arrow">
                <span>➜</span>
                <span className="arrow-label">migrate to</span>
              </div>
              <div className="db-box target">
                <div className="db-label">📥 Target (Current State)</div>
                <div className="db-name">{parseDbName(connections.target)}</div>
                <div className="db-stats">
                  <span>📋 {targetSchema.tables.length} tables</span>
                  <span>📇 {targetSchema.indexes?.length || 0} indexes</span>
                </div>
              </div>
            </div>
            <div className="migration-direction" style={{ marginTop: '1rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              Migration will transform <strong style={{ color: 'var(--accent-info)' }}>{parseDbName(connections.target)}</strong> to match <strong style={{ color: 'var(--success)' }}>{parseDbName(connections.source)}</strong>
            </div>
          </div>

          {/* Statistics */}
          <div className="stats">
            <div className="stat">
              <span className="stat-value added">{stats.added}</span>
              <span className="stat-label">Added</span>
            </div>
            <div className="stat">
              <span className="stat-value removed">{stats.removed}</span>
              <span className="stat-label">Removed</span>
            </div>
            <div className="stat">
              <span className="stat-value modified">{stats.modified}</span>
              <span className="stat-label">Modified</span>
            </div>
            {stats.dangerous > 0 && (
              <div className="stat">
                <span className="stat-value" style={{ color: 'var(--danger)' }}>⚠️ {stats.dangerous}</span>
                <span className="stat-label">Dangerous</span>
              </div>
            )}
          </div>

          {diffReport.items.length > 0 && (
            <div className="migration-input">
              <input
                type="text"
                value={migrationName}
                onChange={(e) => setMigrationName(e.target.value)}
                placeholder="Migration name (e.g., add_users_table)"
                style={{ flex: 1 }}
              />
              <button
                className="btn btn-success"
                onClick={generateMigration}
                disabled={generatingMigration || !migrationName.trim()}
              >
                {generatingMigration ? (
                  <>
                    <span className="spinner"></span>
                    Generating...
                  </>
                ) : (
                  '📄 Generate Migration'
                )}
              </button>
            </div>
          )}
        </>
      )}

      {diffReport && diffReport.items.length > 0 && (
        <div className="compare-layout">
          <div className="diff-sidebar card">
            <h3 className="card-title" style={{ padding: '0.5rem', marginBottom: '0.5rem' }}>
              Changes ({diffReport.items.length})
            </h3>
            <DiffTree
              items={diffReport.items}
              selectedItem={selectedDiffItem}
              onSelectItem={setSelectedDiffItem}
            />
          </div>

          <div className="diff-main">
            {selectedDiffItem ? (
              <>
                <div className="card" style={{ marginBottom: '1rem' }}>
                  <DiffDetails item={selectedDiffItem} />
                </div>
                <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <SqlPreview item={selectedDiffItem} />
                </div>
              </>
            ) : (
              <div className="card empty-state">
                <div className="empty-state-icon">👈</div>
                <p>Select a change from the list to view details</p>
              </div>
            )}
          </div>
        </div>
      )}

      {diffReport && diffReport.items.length === 0 && (
        <div className="card empty-state">
          <div className="empty-state-icon">✅</div>
          <h3>Schemas are identical</h3>
          <p>No migration is needed - source and target schemas match.</p>
        </div>
      )}

      {!diffReport && !loading && !canCompare && (
        <div className="card empty-state">
          <div className="empty-state-icon">🔗</div>
          <h3>No Connections</h3>
          <p>Go to the <strong>Connections</strong> page to configure your databases first.</p>
        </div>
      )}
    </div>
  );
}

export default ComparePage;
