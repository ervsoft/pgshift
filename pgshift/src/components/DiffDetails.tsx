import { DiffItem } from '../types';

interface DiffDetailsProps {
  item: DiffItem;
  sourceDb?: string;
  targetDb?: string;
}

function DiffDetails({ item }: DiffDetailsProps) {
  const kindColors: Record<string, string> = {
    added: 'var(--success)',
    removed: 'var(--danger)',
    modified: 'var(--warning)',
  };

  const kindLabels: Record<string, string> = {
    added: '➕ Added',
    removed: '➖ Removed',
    modified: '✏️ Modified',
  };

  const kindDescriptions: Record<string, string> = {
    added: 'This object exists in Source but not in Target. It will be CREATED.',
    removed: 'This object exists in Target but not in Source. It will be DROPPED.',
    modified: 'This object exists in both databases but has differences. It will be ALTERED.',
  };

  const getObjectIcon = (type: string) => {
    switch (type) {
      case 'table': return '📋';
      case 'column': return '📝';
      case 'constraint': return '🔒';
      case 'index': return '📇';
      default: return '📦';
    }
  };

  return (
    <div className="diff-details">
      <div className="diff-details-header">
        <h3 className="card-title">
          {getObjectIcon(item.object_type)} {item.object_name}
        </h3>
        <span className={`operation-badge ${item.kind}`} style={{ color: kindColors[item.kind] }}>
          {kindLabels[item.kind]}
        </span>
      </div>

      {item.dangerous && (
        <div className="danger-alert">
          <span className="danger-icon">⚠️</span>
          <div>
            <strong>Dangerous Operation</strong>
            <p>This operation may cause data loss. Review carefully before applying.</p>
          </div>
        </div>
      )}
      
      <div className="details-content">
        <div className="details-section">
          <h4>Object Information</h4>
          <div className="details-grid">
            <div className="details-row">
              <span className="details-label">Type:</span>
              <span className="details-value" style={{ textTransform: 'capitalize' }}>
                {item.object_type}
              </span>
            </div>
            <div className="details-row">
              <span className="details-label">Name:</span>
              <span className="details-value">{item.object_name}</span>
            </div>
          </div>
        </div>

        <div className="details-section">
          <h4>Change Description</h4>
          <div className="change-description" style={{ backgroundColor: 'var(--bg-primary)', padding: '1rem', borderRadius: '6px', marginTop: '0.5rem' }}>
            <p style={{ color: kindColors[item.kind], marginBottom: '0.5rem', fontWeight: 500 }}>
              {kindDescriptions[item.kind]}
            </p>
            <p style={{ color: 'var(--text-secondary)' }}>{item.details}</p>
          </div>
        </div>

        <div className="details-section">
          <h4>Comparison</h4>
          <div className="comparison-boxes">
            <div className="comparison-box source">
              <div className="comparison-box-header">📤 Source (Desired)</div>
              <div className="comparison-box-content">
                {item.kind === 'removed' ? (
                  <span className="not-exists">Does not exist</span>
                ) : (
                  <span className="exists">✓ Exists</span>
                )}
              </div>
            </div>
            <div className="comparison-box target">
              <div className="comparison-box-header">📥 Target (Current)</div>
              <div className="comparison-box-content">
                {item.kind === 'added' ? (
                  <span className="not-exists">Does not exist</span>
                ) : (
                  <span className="exists">✓ Exists</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="details-section">
          <h4>Action Required</h4>
          <div className="action-info" style={{ backgroundColor: 'var(--bg-primary)', padding: '1rem', borderRadius: '6px', marginTop: '0.5rem' }}>
            {item.kind === 'added' && (
              <p>🆕 <strong>CREATE</strong> this {item.object_type} in Target database</p>
            )}
            {item.kind === 'removed' && (
              <p>🗑️ <strong>DROP</strong> this {item.object_type} from Target database</p>
            )}
            {item.kind === 'modified' && (
              <p>🔄 <strong>ALTER</strong> this {item.object_type} in Target database</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DiffDetails;
