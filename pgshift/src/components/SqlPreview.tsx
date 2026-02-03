import { useState } from 'react';
import { DiffItem } from '../types';

interface SqlPreviewProps {
  item: DiffItem;
}

function SqlPreview({ item }: SqlPreviewProps) {
  const [activeTab, setActiveTab] = useState<'up' | 'down'>('up');

  const sql = activeTab === 'up' ? item.generated_up_sql : item.generated_down_sql;

  // Simple SQL syntax highlighting
  const highlightSql = (code: string): string => {
    const keywords = [
      'CREATE', 'TABLE', 'ALTER', 'DROP', 'ADD', 'COLUMN', 'INDEX', 'CONSTRAINT',
      'PRIMARY', 'KEY', 'UNIQUE', 'NOT', 'NULL', 'DEFAULT', 'CASCADE', 'IF', 'EXISTS',
      'USING', 'ON', 'SET', 'TYPE', 'BEGIN', 'COMMIT', 'ROLLBACK',
    ];
    
    let highlighted = code;
    
    // Highlight keywords
    keywords.forEach((keyword) => {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      highlighted = highlighted.replace(regex, `<span style="color: #e94560;">${keyword}</span>`);
    });
    
    // Highlight strings
    highlighted = highlighted.replace(/'([^']*)'/g, '<span style="color: #10b981;">\'$1\'</span>');
    
    // Highlight comments
    highlighted = highlighted.replace(/(--[^\n]*)/g, '<span style="color: #6b7280;">$1</span>');
    
    return highlighted;
  };

  return (
    <div className="sql-preview">
      <div className="sql-tabs">
        <button
          className={`sql-tab ${activeTab === 'up' ? 'active' : ''}`}
          onClick={() => setActiveTab('up')}
        >
          ⬆️ UP (Apply)
        </button>
        <button
          className={`sql-tab ${activeTab === 'down' ? 'active' : ''}`}
          onClick={() => setActiveTab('down')}
        >
          ⬇️ DOWN (Rollback)
        </button>
      </div>
      
      <div
        className="sql-content"
        dangerouslySetInnerHTML={{ __html: highlightSql(sql) }}
      />
    </div>
  );
}

export default SqlPreview;
