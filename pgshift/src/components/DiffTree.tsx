import { DiffItem } from '../types';

interface DiffTreeProps {
  items: DiffItem[];
  selectedItem: DiffItem | null;
  onSelectItem: (item: DiffItem) => void;
}

function DiffTree({ items, selectedItem, onSelectItem }: DiffTreeProps) {
  // Group items by object type
  const grouped = items.reduce((acc, item) => {
    const type = item.object_type;
    if (!acc[type]) {
      acc[type] = [];
    }
    acc[type].push(item);
    return acc;
  }, {} as Record<string, DiffItem[]>);

  const typeLabels: Record<string, string> = {
    table: '📋 Tables',
    column: '📝 Columns',
    constraint: '🔒 Constraints',
    index: '📇 Indexes',
  };

  const typeOrder = ['table', 'column', 'constraint', 'index'];

  return (
    <div className="diff-tree">
      {typeOrder.map((type) => {
        const typeItems = grouped[type];
        if (!typeItems || typeItems.length === 0) return null;

        return (
          <div key={type} className="diff-group">
            <div className="diff-group-header">
              {typeLabels[type] || type} ({typeItems.length})
            </div>
            {typeItems.map((item) => (
              <div
                key={item.id}
                className={`diff-item ${selectedItem?.id === item.id ? 'selected' : ''}`}
                onClick={() => onSelectItem(item)}
              >
                <span className={`diff-item-badge ${item.kind}`}>
                  {item.kind.charAt(0)}
                </span>
                <span className="diff-item-name" title={item.object_name}>
                  {item.object_name}
                </span>
                {item.dangerous && (
                  <span className="diff-item-dangerous" title="Dangerous operation">
                    ⚠️
                  </span>
                )}
              </div>
            ))}
          </div>
        );
      })}

      {items.length === 0 && (
        <div className="empty-state" style={{ padding: '2rem' }}>
          <p>No differences found</p>
        </div>
      )}
    </div>
  );
}

export default DiffTree;
