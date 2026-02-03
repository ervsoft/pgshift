import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ConnectionState } from '../types';
import LogViewer from '../components/LogViewer';

interface ApplyPageProps {
  connections: ConnectionState;
  migrationPath: string | null;
  logs: string[];
  addLog: (message: string) => void;
  clearLogs: () => void;
  setError: (error: string | null) => void;
  loading: boolean;
  setLoading: (loading: boolean) => void;
}

function ApplyPage({
  connections,
  migrationPath,
  logs,
  addLog,
  clearLogs,
  setError,
  loading,
  setLoading,
}: ApplyPageProps) {
  const [customPath, setCustomPath] = useState(migrationPath || '');
  const [applySuccess, setApplySuccess] = useState(false);

  const effectivePath = customPath || migrationPath;

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

      resultLogs.forEach((log) => addLog(log));
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

  return (
    <div className="page">
      <div className="page-header">
        <h2>Apply Migration</h2>
        <p>Execute migration scripts on your target database.</p>
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

          <div className="form-group">
            <label>Target Database</label>
            <div className="connection-status" style={{ marginTop: '0.5rem' }}>
              <span className={`status-dot ${connections.targetConnected ? 'connected' : 'disconnected'}`}></span>
              <span>
                {connections.targetConnected ? 'Connected' : 'Not connected'} - {connections.target}
              </span>
            </div>
          </div>
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

        <button
          className="btn btn-secondary"
          onClick={clearLogs}
          disabled={logs.length === 0}
        >
          Clear Logs
        </button>

        {!connections.targetConnected && (
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', alignSelf: 'center' }}>
            ⚠️ Connect to target database on the Connections page first
          </span>
        )}
      </div>

      {applySuccess && (
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
