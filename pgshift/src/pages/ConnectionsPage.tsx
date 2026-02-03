import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ConnectionState, SchemaModel, DatabaseInfo, MultiConnectionState, DatabaseConnection } from '../types';

interface ConnectionFields {
  host: string;
  port: string;
  database: string;
  user: string;
  password: string;
}

interface SavedConnection {
  id: string;
  name: string;
  fields: ConnectionFields;
  createdAt: string;
}

interface ConnectionsPageProps {
  connections: ConnectionState;
  updateConnections: (connections: ConnectionState) => void;
  multiConnections: MultiConnectionState;
  addSourceConnection: (connection: DatabaseConnection) => void;
  removeSourceConnection: (id: string) => void;
  updateSourceConnection: (id: string, updates: Partial<DatabaseConnection>) => void;
  addTargetConnection: (connection: DatabaseConnection) => void;
  removeTargetConnection: (id: string) => void;
  updateTargetConnection: (id: string, updates: Partial<DatabaseConnection>) => void;
  setError: (error: string | null) => void;
  setSourceSchema: (schema: SchemaModel | null) => void;
  setTargetSchema: (schema: SchemaModel | null) => void;
}

type InputMode = 'string' | 'fields';

const STORAGE_KEY = 'pgshift_saved_connections';

function parseConnectionString(connStr: string): ConnectionFields {
  try {
    const url = new URL(connStr);
    return {
      host: url.hostname || 'localhost',
      port: url.port || '5432',
      database: url.pathname.slice(1) || '',
      user: decodeURIComponent(url.username) || '',
      password: decodeURIComponent(url.password) || '',
    };
  } catch {
    return { host: 'localhost', port: '5432', database: '', user: '', password: '' };
  }
}

function buildConnectionString(fields: ConnectionFields): string {
  const { host, port, database, user, password } = fields;
  if (!host || !database || !user) return '';
  const passStr = password ? `:${encodeURIComponent(password)}` : '';
  return `postgres://${encodeURIComponent(user)}${passStr}@${host}:${port || '5432'}/${database}`;
}

function loadSavedConnections(): SavedConnection[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveSavedConnections(connections: SavedConnection[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(connections));
}

function generateConnectionName(fields: ConnectionFields): string {
  return `${fields.database}@${fields.host}`;
}

function ConnectionsPage({ 
  connections, 
  updateConnections, 
  multiConnections,
  addSourceConnection,
  removeSourceConnection,
  updateSourceConnection,
  addTargetConnection,
  removeTargetConnection,
  updateTargetConnection,
  setError, 
  setSourceSchema, 
  setTargetSchema 
}: ConnectionsPageProps) {
  const [sourceMode, setSourceMode] = useState<InputMode>('fields');
  const [targetMode, setTargetMode] = useState<InputMode>('fields');
  
  // Multi-connection mode toggle
  const [multiMode, setMultiMode] = useState(false);
  
  // New connection form for multi-mode
  const [newMultiConn, setNewMultiConn] = useState<ConnectionFields>({
    host: 'localhost', port: '5432', database: '', user: '', password: ''
  });
  const [newMultiConnName, setNewMultiConnName] = useState('');
  const [addingTo, setAddingTo] = useState<'source' | 'target' | null>(null);
  
  const [localSource, setLocalSource] = useState(connections.source);
  const [localTarget, setLocalTarget] = useState(connections.target);
  
  const [sourceFields, setSourceFields] = useState<ConnectionFields>(() => 
    connections.source ? parseConnectionString(connections.source) : { host: 'localhost', port: '5432', database: '', user: '', password: '' }
  );
  const [targetFields, setTargetFields] = useState<ConnectionFields>(() => 
    connections.target ? parseConnectionString(connections.target) : { host: 'localhost', port: '5432', database: '', user: '', password: '' }
  );

  const [savedConnections, setSavedConnections] = useState<SavedConnection[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState<'source' | 'target' | null>(null);
  const [newConnectionName, setNewConnectionName] = useState('');
  
  // Database info for each connection
  const [sourceDbInfo, setSourceDbInfo] = useState<DatabaseInfo | null>(null);
  const [targetDbInfo, setTargetDbInfo] = useState<DatabaseInfo | null>(null);

  useEffect(() => {
    setSavedConnections(loadSavedConnections());
  }, []);

  // Load database info when connected
  const loadDbInfo = useCallback(async (type: 'source' | 'target', connectionString: string) => {
    try {
      const [info, schema] = await Promise.all([
        invoke<DatabaseInfo>('get_database_info', { connectionString }),
        invoke<SchemaModel>('introspect', { connectionString }),
      ]);
      
      if (type === 'source') {
        setSourceDbInfo(info);
        setSourceSchema(schema);
      } else {
        setTargetDbInfo(info);
        setTargetSchema(schema);
      }
    } catch (err) {
      console.error(`Failed to load ${type} info:`, err);
    }
  }, [setSourceSchema, setTargetSchema]);

  // Load info when connection state changes
  useEffect(() => {
    if (connections.sourceConnected && connections.source) {
      loadDbInfo('source', connections.source);
    } else {
      setSourceDbInfo(null);
      setSourceSchema(null);
    }
  }, [connections.sourceConnected, connections.source, loadDbInfo, setSourceSchema]);

  useEffect(() => {
    if (connections.targetConnected && connections.target) {
      loadDbInfo('target', connections.target);
    } else {
      setTargetDbInfo(null);
      setTargetSchema(null);
    }
  }, [connections.targetConnected, connections.target, loadDbInfo, setTargetSchema]);

  const saveCurrentConnection = (type: 'source' | 'target') => {
    const fields = type === 'source' ? sourceFields : targetFields;
    const name = newConnectionName.trim() || generateConnectionName(fields);
    
    const newConn: SavedConnection = {
      id: Date.now().toString(),
      name,
      fields: { ...fields },
      createdAt: new Date().toISOString(),
    };
    
    const updated = [...savedConnections, newConn];
    setSavedConnections(updated);
    saveSavedConnections(updated);
    setShowSaveDialog(null);
    setNewConnectionName('');
  };

  const deleteSavedConnection = (id: string) => {
    const updated = savedConnections.filter(c => c.id !== id);
    setSavedConnections(updated);
    saveSavedConnections(updated);
  };

  const loadConnection = (conn: SavedConnection, target: 'source' | 'target') => {
    if (target === 'source') {
      setSourceFields({ ...conn.fields });
      setLocalSource(buildConnectionString(conn.fields));
    } else {
      setTargetFields({ ...conn.fields });
      setLocalTarget(buildConnectionString(conn.fields));
    }
  };

  // Add connection to multi-mode list
  const addMultiConnection = async (type: 'source' | 'target') => {
    const connStr = buildConnectionString(newMultiConn);
    if (!connStr) return;
    
    const name = newMultiConnName.trim() || generateConnectionName(newMultiConn);
    const newConn: DatabaseConnection = {
      id: `${type}-${Date.now()}`,
      name,
      connectionString: connStr,
      connected: false,
      testing: true,
    };
    
    if (type === 'source') {
      addSourceConnection(newConn);
    } else {
      addTargetConnection(newConn);
    }
    
    // Test the connection
    try {
      await invoke<boolean>('test_connection', { connectionString: connStr });
      const [schema, dbInfo] = await Promise.all([
        invoke<SchemaModel>('introspect', { connectionString: connStr }),
        invoke<DatabaseInfo>('get_database_info', { connectionString: connStr }),
      ]);
      
      if (type === 'source') {
        updateSourceConnection(newConn.id, { connected: true, testing: false, schema, dbInfo });
      } else {
        updateTargetConnection(newConn.id, { connected: true, testing: false, schema, dbInfo });
      }
    } catch (err) {
      if (type === 'source') {
        updateSourceConnection(newConn.id, { connected: false, testing: false });
      } else {
        updateTargetConnection(newConn.id, { connected: false, testing: false });
      }
      setError(`Connection failed: ${err}`);
    }
    
    // Reset form
    setNewMultiConn({ host: 'localhost', port: '5432', database: '', user: '', password: '' });
    setNewMultiConnName('');
    setAddingTo(null);
  };

  // Test a multi-connection
  const testMultiConnection = async (id: string, type: 'source' | 'target') => {
    const conn = type === 'source' 
      ? multiConnections.sources.find(c => c.id === id)
      : multiConnections.targets.find(c => c.id === id);
    
    if (!conn) return;
    
    const updateFn = type === 'source' ? updateSourceConnection : updateTargetConnection;
    updateFn(id, { testing: true });
    
    try {
      await invoke<boolean>('test_connection', { connectionString: conn.connectionString });
      const [schema, dbInfo] = await Promise.all([
        invoke<SchemaModel>('introspect', { connectionString: conn.connectionString }),
        invoke<DatabaseInfo>('get_database_info', { connectionString: conn.connectionString }),
      ]);
      updateFn(id, { connected: true, testing: false, schema, dbInfo });
    } catch (err) {
      updateFn(id, { connected: false, testing: false });
      setError(`Connection failed: ${err}`);
    }
  };

  // Load saved connection to multi-mode
  const loadToMulti = async (conn: SavedConnection, type: 'source' | 'target') => {
    const connStr = buildConnectionString(conn.fields);
    const newConn: DatabaseConnection = {
      id: `${type}-${Date.now()}`,
      name: conn.name,
      connectionString: connStr,
      connected: false,
      testing: true,
    };
    
    if (type === 'source') {
      addSourceConnection(newConn);
    } else {
      addTargetConnection(newConn);
    }
    
    // Test connection
    try {
      await invoke<boolean>('test_connection', { connectionString: connStr });
      const [schema, dbInfo] = await Promise.all([
        invoke<SchemaModel>('introspect', { connectionString: connStr }),
        invoke<DatabaseInfo>('get_database_info', { connectionString: connStr }),
      ]);
      
      if (type === 'source') {
        updateSourceConnection(newConn.id, { connected: true, testing: false, schema, dbInfo });
      } else {
        updateTargetConnection(newConn.id, { connected: true, testing: false, schema, dbInfo });
      }
    } catch (err) {
      if (type === 'source') {
        updateSourceConnection(newConn.id, { connected: false, testing: false });
      } else {
        updateTargetConnection(newConn.id, { connected: false, testing: false });
      }
      setError(`Connection failed: ${err}`);
    }
  };

  const swapConnections = () => {
    // Swap fields
    const tempFields = { ...sourceFields };
    setSourceFields({ ...targetFields });
    setTargetFields(tempFields);
    
    // Swap connection strings
    const tempLocal = localSource;
    setLocalSource(localTarget);
    setLocalTarget(tempLocal);
    
    // Swap database info
    const tempDbInfo = sourceDbInfo;
    setSourceDbInfo(targetDbInfo);
    setTargetDbInfo(tempDbInfo);
    
    // Swap connection states (this will trigger useEffect to reload schemas)
    updateConnections({
      source: connections.target,
      target: connections.source,
      sourceConnected: connections.targetConnected,
      targetConnected: connections.sourceConnected,
      sourceTesting: false,
      targetTesting: false,
    });
  };

  const getEffectiveConnectionString = (type: 'source' | 'target'): string => {
    if (type === 'source') {
      return sourceMode === 'string' ? localSource : buildConnectionString(sourceFields);
    } else {
      return targetMode === 'string' ? localTarget : buildConnectionString(targetFields);
    }
  };

  const testConnection = async (type: 'source' | 'target') => {
    const connectionString = getEffectiveConnectionString(type);
    
    updateConnections({
      ...connections,
      [`${type}Testing`]: true,
    });

    try {
      await invoke<boolean>('test_connection', { connectionString });
      
      updateConnections({
        ...connections,
        [type]: connectionString,
        [`${type}Connected`]: true,
        [`${type}Testing`]: false,
      });
      
      setError(null);
    } catch (err) {
      updateConnections({
        ...connections,
        [`${type}Connected`]: false,
        [`${type}Testing`]: false,
      });
      setError(`${type === 'source' ? 'Source' : 'Target'} connection failed: ${err}`);
    }
  };

  const getStatusClass = (type: 'source' | 'target') => {
    if (connections[`${type}Testing`]) return 'testing';
    if (connections[`${type}Connected`]) return 'connected';
    return 'disconnected';
  };

  const getStatusText = (type: 'source' | 'target') => {
    if (connections[`${type}Testing`]) return 'Testing...';
    if (connections[`${type}Connected`]) return 'Connected';
    return 'Not connected';
  };

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2>Database Connections</h2>
            <p>Configure your source (desired state) and target (current state) PostgreSQL connections.</p>
          </div>
          <div className="input-mode-toggle">
            <button 
              className={`toggle-btn ${!multiMode ? 'active' : ''}`}
              onClick={() => setMultiMode(false)}
            >
              Single Mode
            </button>
            <button 
              className={`toggle-btn ${multiMode ? 'active' : ''}`}
              onClick={() => setMultiMode(true)}
            >
              Multi Mode
            </button>
          </div>
        </div>
      </div>

      {/* Multi-mode UI */}
      {multiMode && (
        <>
          <div className="card" style={{ marginBottom: '1.5rem', background: 'linear-gradient(135deg, var(--bg-secondary), var(--bg-tertiary))' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '1.5rem' }}>🔀</span>
              <div>
                <h4 style={{ margin: 0 }}>Multi-Connection Mode</h4>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                  Add multiple sources to merge schemas, or multiple targets to deploy migrations to all.
                </p>
              </div>
            </div>
          </div>

          <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
            {/* Multi Sources */}
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">📤 Source Databases ({multiConnections.sources.length})</h3>
                <button 
                  className="btn btn-sm btn-primary"
                  onClick={() => setAddingTo('source')}
                >
                  + Add Source
                </button>
              </div>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '0.875rem' }}>
                Multiple sources will be merged into a unified schema.
              </p>
              
              {multiConnections.sources.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                  No source connections added yet
                </div>
              ) : (
                <div className="multi-connection-list">
                  {multiConnections.sources.map((conn) => (
                    <div key={conn.id} className="multi-connection-item">
                      <div className="multi-conn-header">
                        <span className={`status-dot ${conn.testing ? 'testing' : conn.connected ? 'connected' : 'disconnected'}`}></span>
                        <span className="multi-conn-name">{conn.name}</span>
                        {conn.testing && <span className="spinner" style={{ width: 14, height: 14 }}></span>}
                      </div>
                      {conn.connected && conn.dbInfo && (
                        <div className="multi-conn-info">
                          <span>{conn.dbInfo.table_count} tables</span>
                          <span>•</span>
                          <span>{conn.dbInfo.database_size}</span>
                        </div>
                      )}
                      <div className="multi-conn-actions">
                        <button 
                          className="btn btn-sm"
                          onClick={() => testMultiConnection(conn.id, 'source')}
                          disabled={conn.testing}
                        >
                          🔄
                        </button>
                        <button 
                          className="btn btn-sm btn-danger"
                          onClick={() => removeSourceConnection(conn.id)}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Multi Targets */}
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">📥 Target Databases ({multiConnections.targets.length})</h3>
                <button 
                  className="btn btn-sm btn-primary"
                  onClick={() => setAddingTo('target')}
                >
                  + Add Target
                </button>
              </div>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '0.875rem' }}>
                Migrations will be applied to all target databases.
              </p>
              
              {multiConnections.targets.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                  No target connections added yet
                </div>
              ) : (
                <div className="multi-connection-list">
                  {multiConnections.targets.map((conn) => (
                    <div key={conn.id} className="multi-connection-item">
                      <div className="multi-conn-header">
                        <span className={`status-dot ${conn.testing ? 'testing' : conn.connected ? 'connected' : 'disconnected'}`}></span>
                        <span className="multi-conn-name">{conn.name}</span>
                        {conn.testing && <span className="spinner" style={{ width: 14, height: 14 }}></span>}
                      </div>
                      {conn.connected && conn.dbInfo && (
                        <div className="multi-conn-info">
                          <span>{conn.dbInfo.table_count} tables</span>
                          <span>•</span>
                          <span>{conn.dbInfo.database_size}</span>
                        </div>
                      )}
                      <div className="multi-conn-actions">
                        <button 
                          className="btn btn-sm"
                          onClick={() => testMultiConnection(conn.id, 'target')}
                          disabled={conn.testing}
                        >
                          🔄
                        </button>
                        <button 
                          className="btn btn-sm btn-danger"
                          onClick={() => removeTargetConnection(conn.id)}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Add from saved connections in multi mode */}
          {savedConnections.length > 0 && (
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <h3 className="card-title" style={{ marginBottom: '1rem' }}>💾 Quick Add from Saved</h3>
              <div className="saved-connections-list">
                {savedConnections.map((conn) => (
                  <div key={conn.id} className="saved-connection-item">
                    <div className="saved-connection-info">
                      <span className="saved-connection-name">{conn.name}</span>
                      <span className="saved-connection-details">
                        {conn.fields.user}@{conn.fields.host}:{conn.fields.port}/{conn.fields.database}
                      </span>
                    </div>
                    <div className="saved-connection-actions">
                      <button 
                        className="btn btn-sm" 
                        onClick={() => loadToMulti(conn, 'source')}
                      >
                        📤 Add Source
                      </button>
                      <button 
                        className="btn btn-sm" 
                        onClick={() => loadToMulti(conn, 'target')}
                      >
                        📥 Add Target
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add Connection Modal for Multi Mode */}
          {addingTo && (
            <div className="modal-overlay" onClick={() => setAddingTo(null)}>
              <div className="modal" onClick={(e) => e.stopPropagation()}>
                <h3>{addingTo === 'source' ? '📤 Add Source' : '📥 Add Target'} Connection</h3>
                <div className="form-group">
                  <label>Connection Name</label>
                  <input
                    type="text"
                    value={newMultiConnName}
                    onChange={(e) => setNewMultiConnName(e.target.value)}
                    placeholder="My Database"
                  />
                </div>
                <div className="form-row">
                  <div className="form-group" style={{ flex: 2 }}>
                    <label>Host</label>
                    <input
                      type="text"
                      value={newMultiConn.host}
                      onChange={(e) => setNewMultiConn({ ...newMultiConn, host: e.target.value })}
                      placeholder="localhost"
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Port</label>
                    <input
                      type="text"
                      value={newMultiConn.port}
                      onChange={(e) => setNewMultiConn({ ...newMultiConn, port: e.target.value })}
                      placeholder="5432"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Database</label>
                  <input
                    type="text"
                    value={newMultiConn.database}
                    onChange={(e) => setNewMultiConn({ ...newMultiConn, database: e.target.value })}
                    placeholder="myapp"
                  />
                </div>
                <div className="form-row">
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>User</label>
                    <input
                      type="text"
                      value={newMultiConn.user}
                      onChange={(e) => setNewMultiConn({ ...newMultiConn, user: e.target.value })}
                      placeholder="postgres"
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Password</label>
                    <input
                      type="password"
                      value={newMultiConn.password}
                      onChange={(e) => setNewMultiConn({ ...newMultiConn, password: e.target.value })}
                      placeholder="••••••••"
                    />
                  </div>
                </div>
                <div className="modal-actions">
                  <button className="btn" onClick={() => setAddingTo(null)}>Cancel</button>
                  <button 
                    className="btn btn-primary" 
                    onClick={() => addMultiConnection(addingTo)}
                    disabled={!newMultiConn.database || !newMultiConn.user}
                  >
                    Add & Test
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Single mode UI (existing) */}
      {!multiMode && (
        <>
      {savedConnections.length > 0 && (
        <div className="card saved-connections" style={{ marginBottom: '1.5rem' }}>
          <h3 className="card-title" style={{ marginBottom: '1rem' }}>💾 Saved Connections</h3>
          <div className="saved-connections-list">
            {savedConnections.map((conn) => (
              <div key={conn.id} className="saved-connection-item">
                <div className="saved-connection-info">
                  <span className="saved-connection-name">{conn.name}</span>
                  <span className="saved-connection-details">
                    {conn.fields.user}@{conn.fields.host}:{conn.fields.port}/{conn.fields.database}
                  </span>
                </div>
                <div className="saved-connection-actions">
                  <button 
                    className="btn btn-sm" 
                    onClick={() => loadConnection(conn, 'source')}
                    title="Load as Source"
                  >
                    📤 Source
                  </button>
                  <button 
                    className="btn btn-sm" 
                    onClick={() => loadConnection(conn, 'target')}
                    title="Load as Target"
                  >
                    📥 Target
                  </button>
                  <button 
                    className="btn btn-sm btn-danger" 
                    onClick={() => deleteSavedConnection(conn.id)}
                    title="Delete"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Swap Button */}
      <div className="swap-container" style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
        <button 
          className="btn btn-secondary swap-btn"
          onClick={swapConnections}
          title="Swap Source and Target"
        >
          🔄 Swap Source ↔ Target
        </button>
      </div>

      <div className="grid-2">
        <div className="card connection-card">
          <div className="card-header">
            <h3 className="card-title">📤 Source Database</h3>
            <button 
              className="btn btn-sm"
              onClick={() => {
                setNewConnectionName(generateConnectionName(sourceFields));
                setShowSaveDialog('source');
              }}
              title="Save this connection"
            >
              💾 Save
            </button>
          </div>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '0.875rem' }}>
            The desired schema state. Changes will be generated to transform target into source.
          </p>
          
          <div className="input-mode-toggle" style={{ marginBottom: '1rem' }}>
            <button 
              className={`toggle-btn ${sourceMode === 'fields' ? 'active' : ''}`}
              onClick={() => {
                if (sourceMode === 'string' && localSource) {
                  setSourceFields(parseConnectionString(localSource));
                }
                setSourceMode('fields');
              }}
            >
              Fields
            </button>
            <button 
              className={`toggle-btn ${sourceMode === 'string' ? 'active' : ''}`}
              onClick={() => {
                if (sourceMode === 'fields') {
                  setLocalSource(buildConnectionString(sourceFields));
                }
                setSourceMode('string');
              }}
            >
              Connection String
            </button>
          </div>

          {sourceMode === 'fields' ? (
            <div className="connection-fields">
              <div className="form-row">
                <div className="form-group" style={{ flex: 2 }}>
                  <label>Host</label>
                  <input
                    type="text"
                    value={sourceFields.host}
                    onChange={(e) => setSourceFields({ ...sourceFields, host: e.target.value })}
                    placeholder="localhost"
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Port</label>
                  <input
                    type="text"
                    value={sourceFields.port}
                    onChange={(e) => setSourceFields({ ...sourceFields, port: e.target.value })}
                    placeholder="5432"
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Database</label>
                <input
                  type="text"
                  value={sourceFields.database}
                  onChange={(e) => setSourceFields({ ...sourceFields, database: e.target.value })}
                  placeholder="myapp_dev"
                />
              </div>
              <div className="form-row">
                <div className="form-group" style={{ flex: 1 }}>
                  <label>User</label>
                  <input
                    type="text"
                    value={sourceFields.user}
                    onChange={(e) => setSourceFields({ ...sourceFields, user: e.target.value })}
                    placeholder="postgres"
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Password</label>
                  <input
                    type="password"
                    value={sourceFields.password}
                    onChange={(e) => setSourceFields({ ...sourceFields, password: e.target.value })}
                    placeholder="••••••••"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="form-group">
              <label htmlFor="source-connection">Connection String</label>
              <input
                id="source-connection"
                type="text"
                value={localSource}
                onChange={(e) => setLocalSource(e.target.value)}
                placeholder="postgres://user:password@host:5432/database"
              />
            </div>
          )}
          
          <div className="connection-status">
            <span className={`status-dot ${getStatusClass('source')}`}></span>
            <span>{getStatusText('source')}</span>
          </div>
          
          {/* Show database info when connected */}
          {connections.sourceConnected && sourceDbInfo && (
            <div className="db-info-mini" style={{ marginTop: '1rem', padding: '0.75rem', background: 'var(--bg-tertiary)', borderRadius: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Database:</span>
                <span style={{ fontWeight: 500 }}>{sourceDbInfo.database_name}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Size:</span>
                <span>{sourceDbInfo.database_size}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Tables:</span>
                <span>{sourceDbInfo.table_count}</span>
              </div>
            </div>
          )}
          
          <button
            className="btn btn-primary"
            style={{ marginTop: '1rem' }}
            onClick={() => testConnection('source')}
            disabled={connections.sourceTesting || !getEffectiveConnectionString('source')}
          >
            {connections.sourceTesting ? (
              <>
                <span className="spinner"></span>
                Testing...
              </>
            ) : (
              'Test Connection'
            )}
          </button>
        </div>

        <div className="card connection-card">
          <div className="card-header">
            <h3 className="card-title">📥 Target Database</h3>
            <button 
              className="btn btn-sm"
              onClick={() => {
                setNewConnectionName(generateConnectionName(targetFields));
                setShowSaveDialog('target');
              }}
              title="Save this connection"
            >
              💾 Save
            </button>
          </div>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '0.875rem' }}>
            The current schema state. Migrations will be applied to this database.
          </p>
          
          <div className="input-mode-toggle" style={{ marginBottom: '1rem' }}>
            <button 
              className={`toggle-btn ${targetMode === 'fields' ? 'active' : ''}`}
              onClick={() => {
                if (targetMode === 'string' && localTarget) {
                  setTargetFields(parseConnectionString(localTarget));
                }
                setTargetMode('fields');
              }}
            >
              Fields
            </button>
            <button 
              className={`toggle-btn ${targetMode === 'string' ? 'active' : ''}`}
              onClick={() => {
                if (targetMode === 'fields') {
                  setLocalTarget(buildConnectionString(targetFields));
                }
                setTargetMode('string');
              }}
            >
              Connection String
            </button>
          </div>

          {targetMode === 'fields' ? (
            <div className="connection-fields">
              <div className="form-row">
                <div className="form-group" style={{ flex: 2 }}>
                  <label>Host</label>
                  <input
                    type="text"
                    value={targetFields.host}
                    onChange={(e) => setTargetFields({ ...targetFields, host: e.target.value })}
                    placeholder="localhost"
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Port</label>
                  <input
                    type="text"
                    value={targetFields.port}
                    onChange={(e) => setTargetFields({ ...targetFields, port: e.target.value })}
                    placeholder="5432"
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Database</label>
                <input
                  type="text"
                  value={targetFields.database}
                  onChange={(e) => setTargetFields({ ...targetFields, database: e.target.value })}
                  placeholder="myapp_prod"
                />
              </div>
              <div className="form-row">
                <div className="form-group" style={{ flex: 1 }}>
                  <label>User</label>
                  <input
                    type="text"
                    value={targetFields.user}
                    onChange={(e) => setTargetFields({ ...targetFields, user: e.target.value })}
                    placeholder="postgres"
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Password</label>
                  <input
                    type="password"
                    value={targetFields.password}
                    onChange={(e) => setTargetFields({ ...targetFields, password: e.target.value })}
                    placeholder="••••••••"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="form-group">
              <label htmlFor="target-connection">Connection String</label>
              <input
                id="target-connection"
                type="text"
                value={localTarget}
                onChange={(e) => setLocalTarget(e.target.value)}
                placeholder="postgres://user:password@host:5432/database"
              />
            </div>
          )}
          
          <div className="connection-status">
            <span className={`status-dot ${getStatusClass('target')}`}></span>
            <span>{getStatusText('target')}</span>
          </div>
          
          {/* Show database info when connected */}
          {connections.targetConnected && targetDbInfo && (
            <div className="db-info-mini" style={{ marginTop: '1rem', padding: '0.75rem', background: 'var(--bg-tertiary)', borderRadius: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Database:</span>
                <span style={{ fontWeight: 500 }}>{targetDbInfo.database_name}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Size:</span>
                <span>{targetDbInfo.database_size}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Tables:</span>
                <span>{targetDbInfo.table_count}</span>
              </div>
            </div>
          )}
          
          <button
            className="btn btn-primary"
            style={{ marginTop: '1rem' }}
            onClick={() => testConnection('target')}
            disabled={connections.targetTesting || !getEffectiveConnectionString('target')}
          >
            {connections.targetTesting ? (
              <>
                <span className="spinner"></span>
                Testing...
              </>
            ) : (
              'Test Connection'
            )}
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop: '2rem' }}>
        <h3 className="card-title" style={{ marginBottom: '1rem' }}>📋 Connection String Format</h3>
        <div style={{ fontFamily: 'Monaco, Menlo, monospace', fontSize: '0.875rem', background: 'var(--bg-primary)', padding: '1rem', borderRadius: '6px' }}>
          postgres://username:password@hostname:port/database_name
        </div>
        <div style={{ marginTop: '1rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
          <p><strong>Examples:</strong></p>
          <ul style={{ marginLeft: '1.5rem', marginTop: '0.5rem' }}>
            <li>postgres://postgres:secret@localhost:5432/myapp_dev</li>
            <li>postgres://admin:pass123@db.example.com:5432/production</li>
          </ul>
        </div>
      </div>

      {/* Save Dialog Modal */}
      {showSaveDialog && (
        <div className="modal-overlay" onClick={() => setShowSaveDialog(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>💾 Save Connection</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Save this {showSaveDialog} connection for quick access later.
            </p>
            <div className="form-group">
              <label>Connection Name</label>
              <input
                type="text"
                value={newConnectionName}
                onChange={(e) => setNewConnectionName(e.target.value)}
                placeholder="My Database"
                autoFocus
              />
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setShowSaveDialog(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={() => saveCurrentConnection(showSaveDialog)}>
                Save Connection
              </button>
            </div>
          </div>
        </div>
      )}
    </>
    )}
    </div>
  );
}

export default ConnectionsPage;
