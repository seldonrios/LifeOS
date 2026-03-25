import type { ScreenId } from '../types';

interface SidebarProps {
  active: ScreenId;
  onSelect: (screen: ScreenId) => void;
}

const NAV_ITEMS: Array<{ id: ScreenId; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'graph', label: 'Life Graph' },
  { id: 'goals', label: 'Goal Builder' },
  { id: 'marketplace', label: 'Marketplace' },
  { id: 'settings', label: 'Settings' },
];

export function Sidebar({ active, onSelect }: SidebarProps): JSX.Element {
  return (
    <aside className="sidebar">
      <h2>LIFEOS</h2>
      {NAV_ITEMS.map((item) => (
        <button
          key={item.id}
          className={`nav-item ${active === item.id ? 'active' : ''}`}
          onClick={() => onSelect(item.id)}
          type="button"
        >
          {item.label}
        </button>
      ))}
    </aside>
  );
}
