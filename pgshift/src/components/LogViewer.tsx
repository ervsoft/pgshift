interface LogViewerProps {
  logs: string[];
}

function LogViewer({ logs }: LogViewerProps) {
  const getLogClass = (log: string): string => {
    if (log.includes('Error') || log.includes('FAILED') || log.includes('❌')) {
      return 'error';
    }
    if (log.includes('successfully') || log.includes('✅')) {
      return 'success';
    }
    return '';
  };

  return (
    <div className="log-viewer">
      {logs.length === 0 ? (
        <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '1rem' }}>
          No log entries yet. Run a comparison or apply a migration to see logs.
        </div>
      ) : (
        logs.map((log, index) => (
          <div key={index} className={`log-entry ${getLogClass(log)}`}>
            {log}
          </div>
        ))
      )}
    </div>
  );
}

export default LogViewer;
