import type { ScreenId } from '../types';

interface SidebarProps {
  active: ScreenId;
  onSelect: (screen: ScreenId) => void;
  onHelpOpen: () => void;
}

const NAV_ITEMS: Array<{ id: ScreenId; label: string; icon: string }> = [
  { id: 'today', label: 'Today', icon: '*' },
  { id: 'inbox', label: 'Inbox', icon: '@' },
  { id: 'plans', label: 'Plans', icon: '+' },
  { id: 'review', label: 'Review', icon: '↺' },
  { id: 'memory', label: 'Memory', icon: '◎' },
  { id: 'integrations', label: 'Integrations', icon: '#' },
  { id: 'settings', label: 'Settings', icon: '~' },
];

export function Sidebar({ active, onSelect, onHelpOpen }: SidebarProps): JSX.Element {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
          <circle cx="11" cy="11" r="10" stroke="#7ab8cc" strokeWidth="1.5" />
          <circle cx="11" cy="11" r="4" fill="#7ab8cc" />
          <line x1="11" y1="1" x2="11" y2="5.5" stroke="#7ab8cc" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="11" y1="16.5" x2="11" y2="21" stroke="#7ab8cc" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="1" y1="11" x2="5.5" y2="11" stroke="#7ab8cc" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="16.5" y1="11" x2="21" y2="11" stroke="#7ab8cc" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <h2>LIFEOS</h2>
      </div>
      {NAV_ITEMS.map((item) => (
        <button
          key={item.id}
          data-testid={`nav-${item.id}`}
          className={`nav-item ${active === item.id ? 'active' : ''}`}
          onClick={() => onSelect(item.id)}
          type="button"
        >
          <span className="nav-icon" aria-hidden="true">{item.icon}</span>
          {item.label}
        </button>
      ))}
      <button
        type="button"
        className="nav-item help-btn"
        tabIndex={0}
        aria-label="Help"
        onClick={onHelpOpen}
      >
        <span className="nav-icon" aria-hidden="true">?</span>
        Help
      </button>
    </aside>
  );
}
