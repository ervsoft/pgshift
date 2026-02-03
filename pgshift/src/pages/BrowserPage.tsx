import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ConnectionState, SchemaModel, Table, EnumType } from '../types';
import './BrowserPage.css';

interface DatabaseInfo {
  database_name: string;
  current_user: string;
  pg_version: string;
  database_size: string;
  table_count: number;
}

interface TableDataResult {
  columns: string[];
  rows: { values: Record<string, unknown> }[];
  total_count: number;
  page: number;
  page_size: number;
}

interface BrowserPageProps {
  connections: ConnectionState;
  setError: (error: string | null) => void;
}

type ActiveDb = 'source' | 'target';
type ViewMode = 'structure' | 'data' | 'indexes' | 'sql';

function BrowserPage({ connections, setError }: BrowserPageProps) {
  const [activeDb, setActiveDb] = useState<ActiveDb>('source');
  const [schema, setSchema] = useState<SchemaModel | null>(null);
  const [dbInfo, setDbInfo] = useState<DatabaseInfo | null>(null);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [selectedEnum, setSelectedEnum] = useState<EnumType | null>(null);
  const [tableData, setTableData] = useState<TableDataResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('structure');
  
  // Sidebar state
  const [tableFilter, setTableFilter] = useState('');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['tables']));
  
  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize] = useState(100);
  const [orderBy, setOrderBy] = useState<string | null>(null);
  const [orderDir, setOrderDir] = useState<'ASC' | 'DESC'>('ASC');
  
  // Query editor state
  const [showQueryEditor, setShowQueryEditor] = useState(false);
  const [query, setQuery] = useState('');
  const [queryResult, setQueryResult] = useState<Record<string, unknown> | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryHistory, setQueryHistory] = useState<string[]>([]);

  const connectionString = activeDb === 'source' ? connections.source : connections.target;
  const isConnected = activeDb === 'source' ? connections.sourceConnected : connections.targetConnected;

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const loadSchema = useCallback(async () => {
    if (!connectionString || !isConnected) return;
    
    setLoading(true);
    try {
      const [schemaResult, infoResult] = await Promise.all([
        invoke<SchemaModel>('introspect', { connectionString }),
        invoke<DatabaseInfo>('get_database_info', { connectionString }),
      ]);
      setSchema(schemaResult);
      setDbInfo(infoResult);
      setSelectedTable(null);
      setSelectedEnum(null);
      setTableData(null);
      setError(null);
    } catch (err) {
      setError(`Failed to load schema: ${err}`);
    } finally {
      setLoading(false);
    }
  }, [connectionString, isConnected, setError]);

  useEffect(() => {
    if (isConnected) {
      loadSchema();
    }
  }, [loadSchema, isConnected, activeDb]);

  const loadTableData = useCallback(async (table: Table) => {
    if (!connectionString) return;
    
    setDataLoading(true);
    try {
      const result = await invoke<TableDataResult>('get_table_data', {
        connectionString,
        tableName: table.name,
        page,
        pageSize,
        orderBy,
        orderDir,
      });
      setTableData(result);
      setError(null);
    } catch (err) {
      setError(`Failed to load table data: ${err}`);
    } finally {
      setDataLoading(false);
    }
  }, [connectionString, page, pageSize, orderBy, orderDir, setError]);

  useEffect(() => {
    if (selectedTable && viewMode === 'data') {
      loadTableData(selectedTable);
    }
  }, [selectedTable, page, orderBy, orderDir, viewMode, loadTableData]);

  const handleTableSelect = (table: Table) => {
    setSelectedTable(table);
    setSelectedEnum(null);
    setPage(1);
    setOrderBy(null);
    setOrderDir('ASC');
    setViewMode('structure');
  };

  const handleEnumSelect = (enumType: EnumType) => {
    setSelectedEnum(enumType);
    setSelectedTable(null);
  };

  const handleSort = (column: string) => {
    if (orderBy === column) {
      setOrderDir(orderDir === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setOrderBy(column);
      setOrderDir('ASC');
    }
  };

  const executeQuery = async () => {
    if (!query.trim() || !connectionString) return;
    
    setQueryLoading(true);
    setQueryResult(null);
    try {
      const result = await invoke<Record<string, unknown>>('execute_query', {
        connectionString,
        query: query.trim(),
      });
      setQueryResult(result);
      setQueryHistory((prev: string[]) => [query.trim(), ...prev.slice(0, 19)]);
      setError(null);
    } catch (err) {
      setError(`Query failed: ${err}`);
    } finally {
      setQueryLoading(false);
    }
  };

  const filteredTables = schema?.tables.filter((t: Table) => 
    t.name.toLowerCase().includes(tableFilter.toLowerCase())
  ) || [];

  const filteredEnums = schema?.enums?.filter((e: EnumType) =>
    e.name.toLowerCase().includes(tableFilter.toLowerCase())
  ) || [];

  const totalPages = tableData ? Math.ceil(tableData.total_count / pageSize) : 0;

  // Check if any database is connected
  const hasConnection = connections.sourceConnected || connections.targetConnected;

  if (!hasConnection) {
    return (
      <div className="browser-page">
        <div className="browser-empty-state">
          <div className="empty-icon">🗄️</div>
          <h2>Database Browser</h2>
          <p>Connect to a database to browse tables, view data, and explore your schema.</p>
          <a href="/" className="empty-link">Go to Connections →</a>
        </div>
      </div>
    );
  }

  return (
    <div className="browser-page">
      {/* Top Toolbar */}
      <div className="browser-toolbar">
        <div className="toolbar-left">
          <div className="db-switcher">
            {connections.sourceConnected && (
              <button
                className={`db-tab ${activeDb === 'source' ? 'active' : ''}`}
                onClick={() => setActiveDb('source')}
              >
                <span className="db-dot source" />
                Source
              </button>
            )}
            {connections.targetConnected && (
              <button
                className={`db-tab ${activeDb === 'target' ? 'active' : ''}`}
                onClick={() => setActiveDb('target')}
              >
                <span className="db-dot target" />
                Target
              </button>
            )}
          </div>
          
          {dbInfo && (
            <div className="db-info-bar">
              <span className="db-name">{dbInfo.database_name}</span>
              <span className="db-meta">{dbInfo.table_count} tables</span>
              <span className="db-meta">{dbInfo.database_size}</span>
              <span className="db-meta">v{dbInfo.pg_version.split(' ')[0]}</span>
            </div>
          )}
        </div>
        
        <div className="toolbar-right">
          <button 
            className={`toolbar-btn ${showQueryEditor ? 'active' : ''}`}
            onClick={() => setShowQueryEditor(!showQueryEditor)}
          >
            💻 Query
          </button>
          <button 
            className="toolbar-btn"
            onClick={loadSchema}
            disabled={loading}
          >
            {loading ? '⏳' : '🔄'} Refresh
          </button>
        </div>
      </div>

      {/* Query Editor Panel */}
      {showQueryEditor && (
        <div className="query-panel">
          <div className="query-editor-wrapper">
            <textarea
              className="query-textarea"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="SELECT * FROM your_table LIMIT 100;"
              spellCheck={false}
            />
            <div className="query-actions">
              <button 
                className="btn-execute" 
                onClick={executeQuery} 
                disabled={queryLoading || !query.trim()}
              >
                {queryLoading ? '⏳' : '▶'} Execute
              </button>
              <button className="btn-clear" onClick={() => setQuery('')}>Clear</button>
              {queryHistory.length > 0 && (
                <select 
                  className="history-select"
                  onChange={(e) => setQuery(e.target.value)}
                  value=""
                >
                  <option value="">📜 History</option>
                  {queryHistory.map((q: string, i: number) => (
                    <option key={i} value={q}>{q.slice(0, 40)}...</option>
                  ))}
                </select>
              )}
            </div>
          </div>
          
          {queryResult && (
            <div className="query-results">
              {(queryResult as { type: string }).type === 'select' ? (
                <>
                  <div className="results-header">
                    {(queryResult as { row_count: number }).row_count} rows
                  </div>
                  <div className="results-table-wrapper">
                    <table className="results-table">
                      <thead>
                        <tr>
                          {((queryResult as { columns?: string[] }).columns || []).map((col: string) => (
                            <th key={col}>{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {((queryResult as { rows?: Record<string, unknown>[] }).rows || []).slice(0, 100).map((row: Record<string, unknown>, i: number) => (
                          <tr key={i}>
                            {((queryResult as { columns?: string[] }).columns || []).map((col: string) => (
                              <td key={col}>{formatCellValue(row[col])}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="results-success">
                  ✅ {(queryResult as { rows_affected: number }).rows_affected} rows affected
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Main Content Area */}
      <div className="browser-body">
        {/* Sidebar */}
        <aside className="browser-sidebar">
          <div className="sidebar-search-box">
            <input
              type="text"
              placeholder="Search..."
              value={tableFilter}
              onChange={(e) => setTableFilter(e.target.value)}
            />
          </div>
          
          <nav className="sidebar-nav">
            {/* Tables Section */}
            <div className="nav-section">
              <div 
                className="nav-section-header"
                onClick={() => toggleSection('tables')}
              >
                <span>{expandedSections.has('tables') ? '▼' : '▶'} Tables</span>
                <span className="nav-count">{filteredTables.length}</span>
              </div>
              {expandedSections.has('tables') && (
                <ul className="nav-list">
                  {loading ? (
                    <li className="nav-loading">Loading...</li>
                  ) : filteredTables.length === 0 ? (
                    <li className="nav-empty">No tables</li>
                  ) : (
                    filteredTables.map((table: Table) => (
                      <li
                        key={table.name}
                        className={`nav-item ${selectedTable?.name === table.name ? 'active' : ''}`}
                        onClick={() => handleTableSelect(table)}
                      >
                        <span className="nav-icon">📊</span>
                        <span className="nav-label">{table.name}</span>
                        <span className="nav-badge">{table.columns.length}</span>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>

            {/* Enums Section */}
            {(schema?.enums?.length || 0) > 0 && (
              <div className="nav-section">
                <div 
                  className="nav-section-header"
                  onClick={() => toggleSection('enums')}
                >
                  <span>{expandedSections.has('enums') ? '▼' : '▶'} Enums</span>
                  <span className="nav-count">{filteredEnums.length}</span>
                </div>
                {expandedSections.has('enums') && (
                  <ul className="nav-list">
                    {filteredEnums.map((enumType: EnumType) => (
                      <li
                        key={enumType.name}
                        className={`nav-item ${selectedEnum?.name === enumType.name ? 'active' : ''}`}
                        onClick={() => handleEnumSelect(enumType)}
                      >
                        <span className="nav-icon">🏷️</span>
                        <span className="nav-label">{enumType.name}</span>
                        <span className="nav-badge">{enumType.values.length}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </nav>
        </aside>

        {/* Main Panel */}
        <main className="browser-main">
          {selectedTable ? (
            <div className="detail-panel">
              <div className="detail-header">
                <div className="detail-title">
                  <h2>📊 {selectedTable.name}</h2>
                  {tableData && (
                    <span className="row-count">{tableData.total_count.toLocaleString()} rows</span>
                  )}
                </div>
                
                <div className="view-switcher">
                  <button
                    className={viewMode === 'structure' ? 'active' : ''}
                    onClick={() => setViewMode('structure')}
                  >
                    Structure
                  </button>
                  <button
                    className={viewMode === 'data' ? 'active' : ''}
                    onClick={() => setViewMode('data')}
                  >
                    Data
                  </button>
                  <button
                    className={viewMode === 'indexes' ? 'active' : ''}
                    onClick={() => setViewMode('indexes')}
                  >
                    Indexes
                  </button>
                  <button
                    className={viewMode === 'sql' ? 'active' : ''}
                    onClick={() => setViewMode('sql')}
                  >
                    DDL
                  </button>
                </div>
              </div>

              <div className="detail-content">
                {viewMode === 'structure' && <StructureView table={selectedTable} />}
                {viewMode === 'data' && (
                  <DataView
                    data={tableData}
                    loading={dataLoading}
                    page={page}
                    totalPages={totalPages}
                    orderBy={orderBy}
                    orderDir={orderDir}
                    onPageChange={setPage}
                    onSort={handleSort}
                  />
                )}
                {viewMode === 'indexes' && <IndexesView table={selectedTable} />}
                {viewMode === 'sql' && (
                  <SQLView table={selectedTable} onExecute={(sql) => {
                    setQuery(sql);
                    setShowQueryEditor(true);
                  }} />
                )}
              </div>
            </div>
          ) : selectedEnum ? (
            <div className="detail-panel">
              <div className="detail-header">
                <div className="detail-title">
                  <h2>🏷️ {selectedEnum.name}</h2>
                  <span className="row-count">ENUM type</span>
                </div>
              </div>
              <div className="detail-content">
                <EnumView enumType={selectedEnum} />
              </div>
            </div>
          ) : (
            <div className="empty-selection">
              <div className="empty-icon">👈</div>
              <h3>Select an object</h3>
              <p>Choose a table or enum from the sidebar</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// Structure View Component
function StructureView({ table }: { table: Table }) {
  return (
    <div className="structure-view">
      <table className="structure-table">
        <thead>
          <tr>
            <th style={{ width: 50 }}>#</th>
            <th>Column Name</th>
            <th>Data Type</th>
            <th style={{ width: 100 }}>Nullable</th>
            <th>Default Value</th>
            <th style={{ width: 100 }}>Key</th>
          </tr>
        </thead>
        <tbody>
          {table.columns.map((col, idx) => (
            <tr key={col.name}>
              <td className="col-num">{idx + 1}</td>
              <td className="col-name">{col.name}</td>
              <td className="col-type">
                <span className="type-badge">{col.data_type}</span>
              </td>
              <td className="col-nullable">
                {col.is_nullable ? (
                  <span className="nullable-yes">NULL</span>
                ) : (
                  <span className="nullable-no">NOT NULL</span>
                )}
              </td>
              <td className="col-default">
                {col.default_value ? (
                  <code className="default-value">{col.default_value}</code>
                ) : (
                  <span className="no-default">—</span>
                )}
              </td>
              <td className="col-key">
                {table.primary_key?.columns.includes(col.name) && (
                  <span className="key-badge pk">🔑 PK</span>
                )}
                {table.unique_constraints.some(c => c.columns.includes(col.name)) && (
                  <span className="key-badge unique">UQ</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      
      {/* Constraints Summary */}
      {(table.primary_key || table.unique_constraints.length > 0) && (
        <div className="constraints-summary">
          <h4>Constraints</h4>
          {table.primary_key && (
            <div className="constraint-item">
              <span className="constraint-type pk">PRIMARY KEY</span>
              <span className="constraint-name">{table.primary_key.name}</span>
              <span className="constraint-cols">({table.primary_key.columns.join(', ')})</span>
            </div>
          )}
          {table.unique_constraints.map(uc => (
            <div key={uc.name} className="constraint-item">
              <span className="constraint-type unique">UNIQUE</span>
              <span className="constraint-name">{uc.name}</span>
              <span className="constraint-cols">({uc.columns.join(', ')})</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Data View Component
function DataView({ 
  data, 
  loading, 
  page, 
  totalPages, 
  orderBy, 
  orderDir,
  onPageChange, 
  onSort 
}: { 
  data: TableDataResult | null;
  loading: boolean;
  page: number;
  totalPages: number;
  orderBy: string | null;
  orderDir: 'ASC' | 'DESC';
  onPageChange: (p: number) => void;
  onSort: (col: string) => void;
}) {
  if (loading) {
    return <div className="data-loading">⏳ Loading data...</div>;
  }

  if (!data || data.rows.length === 0) {
    return <div className="data-empty">📭 No data in this table</div>;
  }

  return (
    <div className="data-view">
      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th className="row-num-header">#</th>
              {data.columns.map((col) => (
                <th 
                  key={col}
                  className={`sortable ${orderBy === col ? 'sorted' : ''}`}
                  onClick={() => onSort(col)}
                >
                  {col}
                  {orderBy === col && (
                    <span className="sort-arrow">{orderDir === 'ASC' ? ' ↑' : ' ↓'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, i) => (
              <tr key={i}>
                <td className="row-num">{(page - 1) * data.page_size + i + 1}</td>
                {data.columns.map((col) => (
                  <td key={col} title={String(row.values[col] ?? '')}>
                    {formatCellValue(row.values[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <div className="data-pagination">
        <div className="pagination-info">
          Showing {((page - 1) * data.page_size) + 1} - {Math.min(page * data.page_size, data.total_count)} of {data.total_count.toLocaleString()}
        </div>
        <div className="pagination-controls">
          <button className="page-btn" onClick={() => onPageChange(1)} disabled={page === 1}>⏮</button>
          <button className="page-btn" onClick={() => onPageChange(page - 1)} disabled={page === 1}>◀</button>
          <span className="page-num">Page {page} of {totalPages}</span>
          <button className="page-btn" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>▶</button>
          <button className="page-btn" onClick={() => onPageChange(totalPages)} disabled={page >= totalPages}>⏭</button>
        </div>
      </div>
    </div>
  );
}

// Indexes View Component
function IndexesView({ table }: { table: Table }) {
  if (table.indexes.length === 0) {
    return <div className="indexes-empty">📭 No indexes on this table</div>;
  }

  return (
    <div className="indexes-view">
      <table className="structure-table">
        <thead>
          <tr>
            <th>Index Name</th>
            <th>Columns</th>
            <th>Type</th>
            <th style={{ width: 100 }}>Unique</th>
          </tr>
        </thead>
        <tbody>
          {table.indexes.map((idx) => (
            <tr key={idx.name}>
              <td className="index-name">{idx.name}</td>
              <td className="index-cols">{idx.columns.join(', ')}</td>
              <td className="index-type">
                <span className="type-badge">{idx.index_type}</span>
              </td>
              <td className="index-unique">
                {idx.is_unique ? (
                  <span className="unique-yes">✓ Yes</span>
                ) : (
                  <span className="unique-no">No</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// SQL View Component
function SQLView({ table, onExecute }: { table: Table; onExecute: (sql: string) => void }) {
  const createTableSql = generateCreateTableSQL(table);
  const selectSql = `SELECT *\nFROM "${table.name}"\nLIMIT 100;`;

  return (
    <div className="sql-view">
      <div className="sql-section">
        <div className="sql-header">
          <h4>CREATE TABLE Statement</h4>
          <button className="btn btn-sm" onClick={() => navigator.clipboard.writeText(createTableSql)}>
            📋 Copy
          </button>
        </div>
        <pre className="sql-code">{createTableSql}</pre>
      </div>
      
      <div className="sql-section">
        <div className="sql-header">
          <h4>Quick Queries</h4>
        </div>
        <div className="quick-queries">
          <button className="quick-query-btn" onClick={() => onExecute(selectSql)}>
            ▶ SELECT * LIMIT 100
          </button>
          <button className="quick-query-btn" onClick={() => onExecute(`SELECT COUNT(*) FROM "${table.name}";`)}>
            ▶ COUNT(*)
          </button>
          <button className="quick-query-btn" onClick={() => onExecute(`SELECT DISTINCT * FROM "${table.name}" LIMIT 100;`)}>
            ▶ SELECT DISTINCT
          </button>
        </div>
      </div>
    </div>
  );
}

function generateCreateTableSQL(table: Table): string {
  let sql = `CREATE TABLE "${table.name}" (\n`;
  
  const columnDefs = table.columns.map(col => {
    let def = `  "${col.name}" ${col.data_type}`;
    if (!col.is_nullable) def += ' NOT NULL';
    if (col.default_value) def += ` DEFAULT ${col.default_value}`;
    return def;
  });
  
  sql += columnDefs.join(',\n');
  
  if (table.primary_key) {
    sql += `,\n  CONSTRAINT "${table.primary_key.name}" PRIMARY KEY (${table.primary_key.columns.map(c => `"${c}"`).join(', ')})`;
  }
  
  for (const uc of table.unique_constraints) {
    sql += `,\n  CONSTRAINT "${uc.name}" UNIQUE (${uc.columns.map(c => `"${c}"`).join(', ')})`;
  }
  
  sql += '\n);';
  
  return sql;
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return '∅';
  if (typeof value === 'boolean') return value ? '✓' : '✗';
  if (typeof value === 'object') return JSON.stringify(value);
  const str = String(value);
  if (str.length > 50) return str.substring(0, 50) + '...';
  return str;
}

// Enum View Component
function EnumView({ enumType }: { enumType: EnumType }) {
  return (
    <div className="enum-view">
      <div className="enum-info">
        <h4>Enum Values ({enumType.values.length})</h4>
        <ul className="enum-value-list">
          {enumType.values.map((val, idx) => (
            <li key={val} className="enum-value-item">
              <span className="enum-idx">{idx + 1}</span>
              <span className="enum-val">{val}</span>
            </li>
          ))}
        </ul>
      </div>
      
      <div className="enum-sql">
        <h4>DDL Statement</h4>
        <pre className="sql-code">
{`CREATE TYPE "${enumType.name}" AS ENUM (
  ${enumType.values.map(v => `'${v}'`).join(',\n  ')}
);`}
        </pre>
      </div>
    </div>
  );
}

export default BrowserPage;
