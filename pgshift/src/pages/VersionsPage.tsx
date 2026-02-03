import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { SchemaVersion, ConnectionState, DiffReport, VersionDiff } from '../types';

interface VersionsPageProps {
  connections: ConnectionState;
  setError: (error: string | null) => void;
}

function VersionsPage({ connections, setError }: VersionsPageProps) {
  const [versions, setVersions] = useState<SchemaVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [basePath, setBasePath] = useState('');
  
  // New version form
  const [showNewVersion, setShowNewVersion] = useState(false);
  const [newVersionName, setNewVersionName] = useState('');
  const [newVersionDesc, setNewVersionDesc] = useState('');
  const [newVersionTags, setNewVersionTags] = useState('');
  const [selectedDb, setSelectedDb] = useState<'source' | 'target'>('source');
  const [saving, setSaving] = useState(false);
  
  // Comparison state
  const [compareMode, setCompareMode] = useState(false);
  const [selectedVersions, setSelectedVersions] = useState<string[]>([]);
  const [comparisonResult, setComparisonResult] = useState<VersionDiff | null>(null);
  const [compareLiveResult, setCompareLiveResult] = useState<DiffReport | null>(null);
  
  // View state
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null);

  const loadVersions = useCallback(async () => {
    if (!basePath) return;
    
    setLoading(true);
    try {
      const result = await invoke<SchemaVersion[]>('list_schema_versions', { basePath });
      setVersions(result);
      setError(null);
    } catch (err) {
      setError(`Failed to load versions: ${err}`);
    } finally {
      setLoading(false);
    }
  }, [basePath, setError]);

  useEffect(() => {
    // Get default migrations directory as base path
    invoke<string>('get_migrations_dir').then((dir) => {
      setBasePath(dir);
    });
  }, []);

  useEffect(() => {
    if (basePath) {
      loadVersions();
    }
  }, [basePath, loadVersions]);

  const selectBasePath = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Schema Versions Directory',
      });
      
      if (selected && typeof selected === 'string') {
        setBasePath(selected);
      }
    } catch (err) {
      setError(`Failed to select directory: ${err}`);
    }
  };

  const saveVersion = async () => {
    if (!newVersionName.trim()) {
      setError('Version name is required');
      return;
    }
    
    const connectionString = selectedDb === 'source' ? connections.source : connections.target;
    if (!connectionString) {
      setError('No database connected');
      return;
    }
    
    setSaving(true);
    try {
      const tags = newVersionTags
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);
      
      await invoke('save_schema_version', {
        connectionString,
        name: newVersionName.trim(),
        description: newVersionDesc.trim(),
        tags,
        basePath,
      });
      
      setShowNewVersion(false);
      setNewVersionName('');
      setNewVersionDesc('');
      setNewVersionTags('');
      loadVersions();
      setError(null);
    } catch (err) {
      setError(`Failed to save version: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  const deleteVersion = async (versionId: string) => {
    if (!confirm('Are you sure you want to delete this version?')) return;
    
    try {
      await invoke('delete_schema_version', { basePath, versionId });
      loadVersions();
      setError(null);
    } catch (err) {
      setError(`Failed to delete version: ${err}`);
    }
  };

  const toggleVersionSelection = (versionId: string) => {
    setSelectedVersions(prev => {
      if (prev.includes(versionId)) {
        return prev.filter(id => id !== versionId);
      }
      if (prev.length >= 2) {
        return [prev[1], versionId];
      }
      return [...prev, versionId];
    });
  };

  const compareVersions = async () => {
    if (selectedVersions.length !== 2) {
      setError('Select exactly 2 versions to compare');
      return;
    }
    
    try {
      const result = await invoke<VersionDiff>('compare_schema_versions', {
        basePath,
        fromVersionId: selectedVersions[0],
        toVersionId: selectedVersions[1],
      });
      setComparisonResult(result);
      setCompareLiveResult(null);
      setError(null);
    } catch (err) {
      setError(`Failed to compare versions: ${err}`);
    }
  };

  const compareWithLive = async (versionId: string, target: 'source' | 'target') => {
    const connectionString = target === 'source' ? connections.source : connections.target;
    if (!connectionString) {
      setError(`No ${target} database connected`);
      return;
    }
    
    try {
      const result = await invoke<DiffReport>('compare_version_with_live', {
        basePath,
        versionId,
        connectionString,
      });
      setCompareLiveResult(result);
      setComparisonResult(null);
      setError(null);
    } catch (err) {
      setError(`Failed to compare with live: ${err}`);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2>📚 Schema Versions</h2>
        <p>Git-like versioning for your database schemas. Create snapshots, compare versions, and track changes over time.</p>
      </div>

      {/* Path Selector */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="path-selector">
          <label>Versions Directory:</label>
          <input
            type="text"
            className="input"
            value={basePath}
            onChange={(e) => setBasePath(e.target.value)}
            placeholder="/path/to/versions"
          />
          <button className="btn btn-secondary" onClick={selectBasePath}>
            📁 Browse
          </button>
          <button className="btn btn-secondary" onClick={loadVersions} disabled={loading}>
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="actions-bar" style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
        <button 
          className="btn btn-primary" 
          onClick={() => setShowNewVersion(true)}
          disabled={!connections.sourceConnected && !connections.targetConnected}
        >
          ➕ New Version
        </button>
        <button 
          className={`btn ${compareMode ? 'btn-warning' : 'btn-secondary'}`}
          onClick={() => {
            setCompareMode(!compareMode);
            setSelectedVersions([]);
            setComparisonResult(null);
            setCompareLiveResult(null);
          }}
        >
          {compareMode ? '✖️ Cancel Compare' : '🔄 Compare Versions'}
        </button>
        {compareMode && selectedVersions.length === 2 && (
          <button className="btn btn-primary" onClick={compareVersions}>
            ⚡ Compare Selected
          </button>
        )}
      </div>

      {/* New Version Form */}
      {showNewVersion && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h3 className="card-title">➕ Create New Version Snapshot</h3>
          <div className="form-grid">
            <div className="form-group">
              <label>Version Name *</label>
              <input
                type="text"
                className="input"
                value={newVersionName}
                onChange={(e) => setNewVersionName(e.target.value)}
                placeholder="e.g., v1.0.0, initial-schema, pre-migration"
              />
            </div>
            <div className="form-group">
              <label>Database to Snapshot</label>
              <div className="toggle-group">
                {connections.sourceConnected && (
                  <button
                    className={`toggle-btn ${selectedDb === 'source' ? 'active' : ''}`}
                    onClick={() => setSelectedDb('source')}
                  >
                    📤 Source
                  </button>
                )}
                {connections.targetConnected && (
                  <button
                    className={`toggle-btn ${selectedDb === 'target' ? 'active' : ''}`}
                    onClick={() => setSelectedDb('target')}
                  >
                    📥 Target
                  </button>
                )}
              </div>
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Description</label>
              <textarea
                className="input"
                value={newVersionDesc}
                onChange={(e) => setNewVersionDesc(e.target.value)}
                placeholder="Describe this version..."
                rows={2}
              />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Tags (comma-separated)</label>
              <input
                type="text"
                className="input"
                value={newVersionTags}
                onChange={(e) => setNewVersionTags(e.target.value)}
                placeholder="e.g., production, stable, release"
              />
            </div>
          </div>
          <div className="form-actions" style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-primary" onClick={saveVersion} disabled={saving}>
              {saving ? '⏳ Saving...' : '💾 Save Version'}
            </button>
            <button className="btn btn-secondary" onClick={() => setShowNewVersion(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Comparison Result */}
      {comparisonResult && (
        <div className="card comparison-result" style={{ marginBottom: '1rem' }}>
          <h3 className="card-title">🔄 Version Comparison</h3>
          <div className="diff-summary">
            {comparisonResult.diff_report.items.length === 0 ? (
              <p className="no-changes">✅ No differences between selected versions</p>
            ) : (
              <>
                <p>{comparisonResult.diff_report.items.length} changes found</p>
                <div className="diff-items">
                  {comparisonResult.diff_report.items.map((item) => (
                    <div key={item.id} className={`diff-item ${item.kind}`}>
                      <span className="diff-kind">{item.kind.toUpperCase()}</span>
                      <span className="diff-type">{item.object_type}</span>
                      <span className="diff-name">{item.object_name}</span>
                      <span className="diff-details">{item.details}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          <button 
            className="btn btn-secondary" 
            onClick={() => setComparisonResult(null)}
            style={{ marginTop: '1rem' }}
          >
            Close
          </button>
        </div>
      )}

      {/* Live Comparison Result */}
      {compareLiveResult && (
        <div className="card comparison-result" style={{ marginBottom: '1rem' }}>
          <h3 className="card-title">🔴 Live Database Comparison</h3>
          <div className="diff-summary">
            {compareLiveResult.items.length === 0 ? (
              <p className="no-changes">✅ Schema matches the live database</p>
            ) : (
              <>
                <p>{compareLiveResult.items.length} changes found</p>
                <div className="diff-items">
                  {compareLiveResult.items.map((item) => (
                    <div key={item.id} className={`diff-item ${item.kind}`}>
                      <span className="diff-kind">{item.kind.toUpperCase()}</span>
                      <span className="diff-type">{item.object_type}</span>
                      <span className="diff-name">{item.object_name}</span>
                      <span className="diff-details">{item.details}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          <button 
            className="btn btn-secondary" 
            onClick={() => setCompareLiveResult(null)}
            style={{ marginTop: '1rem' }}
          >
            Close
          </button>
        </div>
      )}

      {/* Versions List */}
      <div className="versions-list">
        {loading ? (
          <div className="card">
            <div className="loading-state">Loading versions...</div>
          </div>
        ) : versions.length === 0 ? (
          <div className="card">
            <div className="empty-state" style={{ textAlign: 'center', padding: '2rem' }}>
              <p>📭 No schema versions saved yet.</p>
              <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                Connect to a database and create your first version snapshot.
              </p>
            </div>
          </div>
        ) : (
          versions.map((version) => (
            <div 
              key={version.id} 
              className={`card version-card ${compareMode && selectedVersions.includes(version.id) ? 'selected' : ''}`}
              onClick={compareMode ? () => toggleVersionSelection(version.id) : undefined}
            >
              <div className="version-header">
                <div className="version-main">
                  {compareMode && (
                    <input
                      type="checkbox"
                      checked={selectedVersions.includes(version.id)}
                      onChange={() => toggleVersionSelection(version.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                  <div className="version-icon">📸</div>
                  <div className="version-info">
                    <h4 className="version-name">{version.name}</h4>
                    <div className="version-meta">
                      <span className="version-db">🗄️ {version.database_name}</span>
                      <span className="version-date">📅 {formatDate(version.created_at)}</span>
                      <span className="version-tables">📊 {version.schema.tables.length} tables</span>
                    </div>
                    {version.tags.length > 0 && (
                      <div className="version-tags">
                        {version.tags.map((tag) => (
                          <span key={tag} className="tag">{tag}</span>
                        ))}
                      </div>
                    )}
                    {version.description && (
                      <p className="version-desc">{version.description}</p>
                    )}
                  </div>
                </div>
                <div className="version-actions">
                  <button
                    className="btn btn-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedVersion(expandedVersion === version.id ? null : version.id);
                    }}
                  >
                    {expandedVersion === version.id ? '📖 Hide' : '📖 Details'}
                  </button>
                  {connections.sourceConnected && (
                    <button
                      className="btn btn-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        compareWithLive(version.id, 'source');
                      }}
                      title="Compare with Source DB"
                    >
                      🔴 vs Source
                    </button>
                  )}
                  {connections.targetConnected && (
                    <button
                      className="btn btn-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        compareWithLive(version.id, 'target');
                      }}
                      title="Compare with Target DB"
                    >
                      🔴 vs Target
                    </button>
                  )}
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteVersion(version.id);
                    }}
                    title="Delete Version"
                  >
                    🗑️
                  </button>
                </div>
              </div>
              
              {/* Expanded Details */}
              {expandedVersion === version.id && (
                <div className="version-details" style={{ marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                  <h5>Tables in this snapshot:</h5>
                  <div className="tables-grid">
                    {version.schema.tables.map((table) => (
                      <div key={table.name} className="table-mini-card">
                        <span className="table-name">{table.name}</span>
                        <span className="table-cols">{table.columns.length} cols</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default VersionsPage;
