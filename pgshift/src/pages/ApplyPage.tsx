import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ConnectionState, MultiConnectionState, DatabaseConnection, MigrationApplyResult } from '../types';
import LogViewer from '../components/LogViewer';

interface ApplyPageProps {
  connections: ConnectionState;
  multiConnections: MultiConnectionState;
  migrationPath: string | null;
  logs: string[];
  addLog: (message: string) => void;
  clearLogs: () => void;
  setError: (error: string | null) => void;
  loading: boolean;
  setLoading: (loading: boolean) => void;
  updateTargetConnection: (id: string, updates: Partial<DatabaseConnection>) => void;
}

function ApplyPage({
  connections,
  multiConnections,
  migrationPath,
  logs,
  addLog,
  clearLogs,
  setError,
  loading,
  setLoading,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  updateTargetConnection: _updateTargetConnection,
}: ApplyPageProps) {
  const [customPath, setCustomPath] = useState(migrationPath || '');
  const [applySuccess, setApplySuccess] = useState(false);
  const [applyMode, setApplyMode] = useState<'single' | 'multi'>('single');
  const [multiResults, setMultiResults] = useState<MigrationApplyResult[]>([]);
  const [applyingToId, setApplyingToId] = useState<string | null>(null);

  const effectivePath = customPath || migrationPath;
  const hasMultiTargets = multiConnections.targets.filter(c => c.connected).length > 0;

  const applyMigration = async () => {
    if (!effectivePath) {
      setError('Please specify a migration path.');
      return;
    }

    if (!connections.targetConnected) {
      setError('Please connect to the target database first.');
      return;
    }

    setLoading(true);
    setError(null);
    setApplySuccess(false);

    try {
      addLog('Starting migration application...');
      
      const resultLogs = await invoke<string[]>('apply_migration', {
        connectionString: connections.target,
        migrationPath: effectivePath,
      });

      resultLogs.forEach((log: string) => addLog(log));
      setApplySuccess(true);
      addLog('✅ Migration applied successfully!');
    } catch (err) {
      setError(`Migration failed: ${err}`);
      addLog(`❌ Error: ${err}`);
      setApplySuccess(false);
    } finally {
      setLoading(false);
    }
  };

  const applyToMultiTargets = async () => {
    if (!effectivePath) {
      setError('Please specify a migration path.');
      return;
    }

    const connectedTargets = multiConnections.targets.filter(c => c.connected);
    if (connectedTargets.length === 0) {
      setError('No connected target databases.');
      return;
    }

    setLoading(true);
    setError(null);
    setApplySuccess(false);
    setMultiResults([]);

    const results: MigrationApplyResult[] = [];

    for (const target of connectedTargets) {
      setApplyingToId(target.id);
      addLog(`\n--- Applying to: ${target.name} ---`);
      
      const result: MigrationApplyResult = {
        connectionId: target.id,
        connectionName: target.name,
        success: false,
        logs: [],
      };

      try {
        const resultLogs = await invoke<string[]>('apply_migration', {
          connectionString: target.connectionString,
          migrationPath: effectivePath,
        });

        resultLogs.forEach((log: string) => {
          addLog(log);
          result.logs.push(log);
        });
        
        result.success = true;
        addLog(`✅ ${target.name}: Migration applied successfully!`);
      } catch (err) {
        result.success = false;
        result.error = String(err);
        addLog(`❌ ${target.name}: Failed - ${err}`);
      }

      results.push(result);
    }

    setApplyingToId(null);
    setMultiResults(results);
    
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    
    if (failCount === 0) {
      setApplySuccess(true);
      addLog(`\n✅ All ${successCount} migrations applied successfully!`);
    } else {
      setError(`${failCount} of ${results.length} migrations failed.`);
    }
    
    setLoading(false);
  };

  const applyToSingleTarget = async (targetId: string) => {
    if (!effectivePath) {
      setError('Please specify a migration path.');
      return;
    }

    const target = multiConnections.targets.find(t => t.id === targetId);
    if (!target) return;

    setApplyingToId(targetId);
    addLog(`\n--- Applying to: ${target.name} ---`);

    try {
      const resultLogs = await invoke<string[]>('apply_migration', {
        connectionString: target.connectionString,
        migrationPath: effectivePath,
      });

      resultLogs.forEach((log: string) => addLog(log));
      addLog(`✅ ${target.name}: Migration applied successfully!`);
    } catch (err) {
      setError(`Migration failed for ${target.name}: ${err}`);
      addLog(`❌ ${target.name}: Failed - ${err}`);
    } finally {
      setApplyingToId(null);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2>Apply Migration</h2>
            <p>Execute migration scripts on your target database.</p>
          </div>
          {hasMultiTargets && (
            <div className="input-mode-toggle">
              <button 
                className={`toggle-btn ${applyMode === 'single' ? 'active' : ''}`}
                onClick={() => setApplyMode('single')}
              >
                Single Target
              </button>
              <button 
                className={`toggle-btn ${applyMode === 'multi' ? 'active' : ''}`}
                onClick={() => setApplyMode('multi')}
              >
                Multi Target
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="apply-section">
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: '1rem' }}>Migration Path</h3>
          
          {migrationPath && (
            <div className="current-migration">
              <span>📁</span>
              <span>{migrationPath}</span>
              <span style={{ marginLeft: 'auto', color: 'var(--success)', fontSize: '0.875rem' }}>
                Recently generated
              </span>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="migration-path">Migration Folder Path</label>
            <input
              id="migration-path"
              type="text"
              value={customPath}
              onChange={(e) => setCustomPath(e.target.value)}
              placeholder={migrationPath || '/path/to/migrations/20260203120000__migration_name'}
            />
          </div>

          {applyMode === 'single' && (
            <div className="form-group">
              <label>Target Database</label>
              <div className="connection-status" style={{ marginTop: '0.5rem' }}>
                <span className={`status-dot ${connections.targetConnected ? 'connected' : 'disconnected'}`}></span>
                <span>
                  {connections.targetConnected ? 'Connected' : 'Not connected'} - {connections.target}
                </span>
              </div>
            </div>
          )}

          {applyMode === 'multi' && (
            <div className="form-group">
              <label>Target Databases ({multiConnections.targets.filter(c => c.connected).length} connected)</label>
              <div className="multi-connection-list" style={{ marginTop: '0.5rem' }}>
                {multiConnections.targets.map((target) => (
                  <div key={target.id} className="multi-connection-item" style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <span className={`status-dot ${target.connected ? 'connected' : 'disconnected'}`}></span>
                    <span className="multi-conn-name" style={{ flex: 1 }}>{target.name}</span>
                    {target.connected && target.dbInfo && (
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginRight: '0.5rem' }}>
                        {target.dbInfo.table_count} tables
                      </span>
                    )}
                    {applyingToId === target.id && (
                      <span className="spinner" style={{ width: 14, height: 14 }}></span>
                    )}
                    <button
                      className="btn btn-sm"
                      onClick={() => applyToSingleTarget(target.id)}
                      disabled={loading || !effectivePath || !target.connected || applyingToId !== null}
                    >
                      Apply
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {effectivePath && (
        <div className="warning-box">
          <h4>⚠️ Warning: Destructive Operation</h4>
          <p>
            Applying a migration will modify your target database schema. Make sure you have:
          </p>
          <ul style={{ marginLeft: '1.5rem', marginTop: '0.5rem' }}>
            <li>Reviewed the migration SQL carefully</li>
            <li>Backed up your database if needed</li>
            <li>Tested on a staging environment first</li>
          </ul>
        </div>
      )}

      <div className="action-bar">
        {applyMode === 'single' ? (
          <button
            className="btn btn-danger"
            onClick={applyMigration}
            disabled={loading || !effectivePath || !connections.targetConnected}
          >
            {loading ? (
              <>
                <span className="spinner"></span>
                Applying...
              </>
            ) : (
              '🚀 Apply Migration'
            )}
          </button>
        ) : (
          <button
            className="btn btn-danger"
            onClick={applyToMultiTargets}
            disabled={loading || !effectivePath || !hasMultiTargets}
          >
            {loading ? (
              <>
                <span className="spinner"></span>
                Applying to All...
              </>
            ) : (
              `🚀 Apply to All (${multiConnections.targets.filter(c => c.connected).length} targets)`
            )}
          </button>
        )}

        <button
          className="btn btn-secondary"
          onClick={clearLogs}
          disabled={logs.length === 0}
        >
          Clear Logs
        </button>

        {applyMode === 'single' && !connections.targetConnected && (
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', alignSelf: 'center' }}>
            ⚠️ Connect to target database on the Connections page first
          </span>
        )}
      </div>

      {/* Multi-target results summary */}
      {multiResults.length > 0 && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h3 className="card-title" style={{ marginBottom: '0.75rem' }}>📊 Multi-Target Results</h3>
          <div className="multi-connection-list">
            {multiResults.map((result) => (
              <div 
                key={result.connectionId} 
                className="multi-connection-item"
                style={{ 
                  borderColor: result.success ? 'var(--success)' : 'var(--error)',
                  background: result.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'
                }}
              >
                <span style={{ fontSize: '1.25rem' }}>{result.success ? '✅' : '❌'}</span>
                <span className="multi-conn-name">{result.connectionName}</span>
                {result.error && (
                  <span style={{ color: 'var(--error)', fontSize: '0.75rem' }}>{result.error}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {applySuccess && applyMode === 'single' && (
        <div className="card" style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid var(--success)', marginBottom: '1rem' }}>
          <h3 style={{ color: 'var(--success)', marginBottom: '0.5rem' }}>✅ Migration Applied Successfully</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            The migration has been executed on the target database. You can now run a new comparison to verify the changes.
          </p>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Execution Log</h3>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            {logs.length} entries
          </span>
        </div>
        <LogViewer logs={logs} />
      </div>
    </div>
  );
}

export default ApplyPage;
