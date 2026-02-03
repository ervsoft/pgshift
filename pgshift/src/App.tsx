import { useState, useCallback } from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import ConnectionsPage from './pages/ConnectionsPage';
import ComparePage from './pages/ComparePage';
import ApplyPage from './pages/ApplyPage';
import BrowserPage from './pages/BrowserPage';
import VersionsPage from './pages/VersionsPage';
import MigrationsPage from './pages/MigrationsPage';
import { AppState, ConnectionState, SchemaModel, DiffReport, DiffItem, MultiConnectionState, DatabaseConnection } from './types';
import './App.css';

const initialConnectionState: ConnectionState = {
  source: '',
  target: '',
  sourceConnected: false,
  targetConnected: false,
  sourceTesting: false,
  targetTesting: false,
};

const initialMultiConnectionState: MultiConnectionState = {
  sources: [],
  targets: [],
};

function App() {
  const [state, setState] = useState<AppState>({
    connections: initialConnectionState,
    multiConnections: initialMultiConnectionState,
    sourceSchema: null,
    targetSchema: null,
    mergedSchema: null,
    diffReport: null,
    selectedDiffItem: null,
    migrationPath: null,
    logs: [],
    loading: false,
    error: null,
  });

  const updateConnections = useCallback((connections: ConnectionState) => {
    setState((prev) => ({ ...prev, connections }));
  }, []);

  const setSourceSchema = useCallback((schema: SchemaModel | null) => {
    setState((prev) => ({ ...prev, sourceSchema: schema }));
  }, []);

  const setTargetSchema = useCallback((schema: SchemaModel | null) => {
    setState((prev) => ({ ...prev, targetSchema: schema }));
  }, []);

  const setMergedSchema = useCallback((schema: SchemaModel | null) => {
    setState((prev) => ({ ...prev, mergedSchema: schema }));
  }, []);

  const addSourceConnection = useCallback((connection: DatabaseConnection) => {
    setState((prev) => ({
      ...prev,
      multiConnections: {
        ...prev.multiConnections,
        sources: [...prev.multiConnections.sources, connection],
      },
    }));
  }, []);

  const removeSourceConnection = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      multiConnections: {
        ...prev.multiConnections,
        sources: prev.multiConnections.sources.filter((c) => c.id !== id),
      },
    }));
  }, []);

  const updateSourceConnection = useCallback((id: string, updates: Partial<DatabaseConnection>) => {
    setState((prev) => ({
      ...prev,
      multiConnections: {
        ...prev.multiConnections,
        sources: prev.multiConnections.sources.map((c) =>
          c.id === id ? { ...c, ...updates } : c
        ),
      },
    }));
  }, []);

  const addTargetConnection = useCallback((connection: DatabaseConnection) => {
    setState((prev) => ({
      ...prev,
      multiConnections: {
        ...prev.multiConnections,
        targets: [...prev.multiConnections.targets, connection],
      },
    }));
  }, []);

  const removeTargetConnection = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      multiConnections: {
        ...prev.multiConnections,
        targets: prev.multiConnections.targets.filter((c) => c.id !== id),
      },
    }));
  }, []);

  const updateTargetConnection = useCallback((id: string, updates: Partial<DatabaseConnection>) => {
    setState((prev) => ({
      ...prev,
      multiConnections: {
        ...prev.multiConnections,
        targets: prev.multiConnections.targets.map((c) =>
          c.id === id ? { ...c, ...updates } : c
        ),
      },
    }));
  }, []);

  const setDiffReport = useCallback((report: DiffReport | null) => {
    setState((prev) => ({ ...prev, diffReport: report }));
  }, []);

  const setSelectedDiffItem = useCallback((item: DiffItem | null) => {
    setState((prev) => ({ ...prev, selectedDiffItem: item }));
  }, []);

  const setMigrationPath = useCallback((path: string | null) => {
    setState((prev) => ({ ...prev, migrationPath: path }));
  }, []);

  const addLog = useCallback((message: string) => {
    setState((prev) => ({ ...prev, logs: [...prev.logs, message] }));
  }, []);

  const clearLogs = useCallback(() => {
    setState((prev) => ({ ...prev, logs: [] }));
  }, []);

  const setLoading = useCallback((loading: boolean) => {
    setState((prev) => ({ ...prev, loading }));
  }, []);

  const setError = useCallback((error: string | null) => {
    setState((prev) => ({ ...prev, error }));
  }, []);

  return (
    <BrowserRouter>
      <div className="app">
        <header className="app-header">
          <h1>🐘 PGShift</h1>
          <p className="subtitle">PostgreSQL Schema Migration Tool</p>
          <nav className="nav">
            <NavLink to="/" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              🔌 Connections
            </NavLink>
            <NavLink to="/browser" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              🗄️ Browser
            </NavLink>
            <NavLink to="/compare" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              🔍 Compare
            </NavLink>
            <NavLink to="/migrations" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              📦 Migrations
            </NavLink>
            <NavLink to="/versions" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              📚 Versions
            </NavLink>
            <NavLink to="/apply" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              ⚡ Apply
            </NavLink>
          </nav>
        </header>
        
        <main className="app-main">
          {state.error && (
            <div className="error-banner">
              <span>{state.error}</span>
              <button onClick={() => setError(null)}>×</button>
            </div>
          )}
          
          <Routes>
            <Route
              path="/"
              element={
                <ConnectionsPage
                  connections={state.connections}
                  updateConnections={updateConnections}
                  multiConnections={state.multiConnections}
                  addSourceConnection={addSourceConnection}
                  removeSourceConnection={removeSourceConnection}
                  updateSourceConnection={updateSourceConnection}
                  addTargetConnection={addTargetConnection}
                  removeTargetConnection={removeTargetConnection}
                  updateTargetConnection={updateTargetConnection}
                  setError={setError}
                  setSourceSchema={setSourceSchema}
                  setTargetSchema={setTargetSchema}
                />
              }
            />
            <Route
              path="/browser"
              element={
                <BrowserPage
                  connections={state.connections}
                  setError={setError}
                />
              }
            />
            <Route
              path="/compare"
              element={
                <ComparePage
                  connections={state.connections}
                  multiConnections={state.multiConnections}
                  sourceSchema={state.sourceSchema}
                  targetSchema={state.targetSchema}
                  mergedSchema={state.mergedSchema}
                  diffReport={state.diffReport}
                  selectedDiffItem={state.selectedDiffItem}
                  setSourceSchema={setSourceSchema}
                  setTargetSchema={setTargetSchema}
                  setMergedSchema={setMergedSchema}
                  setDiffReport={setDiffReport}
                  setSelectedDiffItem={setSelectedDiffItem}
                  setMigrationPath={setMigrationPath}
                  loading={state.loading}
                  setLoading={setLoading}
                  setError={setError}
                  addLog={addLog}
                />
              }
            />
            <Route
              path="/migrations"
              element={
                <MigrationsPage
                  diffReport={state.diffReport}
                  setError={setError}
                />
              }
            />
            <Route
              path="/versions"
              element={
                <VersionsPage
                  connections={state.connections}
                  setError={setError}
                />
              }
            />
            <Route
              path="/apply"
              element={
                <ApplyPage
                  connections={state.connections}
                  multiConnections={state.multiConnections}
                  migrationPath={state.migrationPath}
                  logs={state.logs}
                  addLog={addLog}
                  clearLogs={clearLogs}
                  setError={setError}
                  loading={state.loading}
                  setLoading={setLoading}
                  updateTargetConnection={updateTargetConnection}
                />
              }
            />
          </Routes>
        </main>
        
        <footer className="app-footer">
          <p>PGShift v0.1.0 • MVP: public schema only</p>
        </footer>
      </div>
    </BrowserRouter>
  );
}

export default App;
