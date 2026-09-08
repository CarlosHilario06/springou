import { BarChart3, Folder, LogOut, Settings } from "lucide-react";

const NAV_ITEMS = [
  { id: "projects", label: "Projetos", icon: Folder },
  { id: "admanager", label: "Ad Manager", icon: BarChart3 },
  { id: "settings", label: "Configurações", icon: Settings },
];

export default function Sidebar({ activePage, onNavigate, user, onLogout }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-brand-mark">S</span>
        Springou
      </div>

      <nav className="sidebar-nav">
        <span className="sidebar-label">Menu</span>

        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={
              activePage === id ? "sidebar-item is-active" : "sidebar-item"
            }
            onClick={() => onNavigate(id)}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <span className="sidebar-user">{user?.email}</span>

        <button type="button" className="sidebar-item" onClick={onLogout}>
          <LogOut size={16} />
          Sair
        </button>
      </div>
    </aside>
  );
}
