import { useCallback, useEffect, useState } from "react";
import Sidebar from "./components/Sidebar";
import Login from "./pages/Login";
import Projects from "./pages/Projects";
import Splitters from "./pages/Splitters";
import Links from "./pages/Links";
import AdManager from "./pages/AdManager";
import Settings from "./pages/Settings";
import {
  UNAUTHORIZED_EVENT,
  clearSession,
  getStoredUser,
  getToken,
} from "./lib/apiClient";

export default function App() {
  const [user, setUser] = useState(() => (getToken() ? getStoredUser() : null));
  const [page, setPage] = useState("projects");
  const [project, setProject] = useState(null);
  const [splitter, setSplitter] = useState(null);

  const handleLogout = useCallback(() => {
    clearSession();
    setUser(null);
    setProject(null);
    setSplitter(null);
    setPage("projects");
  }, []);

  // A API avisa quando o token venceu — desloga sem esperar o próximo clique.
  useEffect(() => {
    window.addEventListener(UNAUTHORIZED_EVENT, handleLogout);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handleLogout);
  }, [handleLogout]);

  if (!user) return <Login onLogin={setUser} />;

  function navigate(nextPage) {
    setPage(nextPage);

    if (nextPage === "projects") {
      setProject(null);
      setSplitter(null);
    }
  }

  function openProject(nextProject) {
    setProject(nextProject);
    setSplitter(null);
    setPage("splitters");
  }

  function openSplitter(nextSplitter) {
    setSplitter(nextSplitter);
    setPage("links");
  }

  /** Salto direto pelo seletor: pode trocar de projeto junto. */
  function openSplitterFrom(nextProject, nextSplitter) {
    setProject(nextProject);
    setSplitter(nextSplitter);
    setPage("links");
  }

  const showBreadcrumb = ["splitters", "links"].includes(page);

  return (
    <div className="app">
      <Sidebar
        activePage={page === "links" || page === "splitters" ? "projects" : page}
        onNavigate={navigate}
        user={user}
        onLogout={handleLogout}
      />

      <main className="main">
        {showBreadcrumb && (
          <nav className="breadcrumb">
            <button type="button" onClick={() => navigate("projects")}>
              Projetos
            </button>

            {project && (
              <>
                <span>›</span>
                {page === "splitters" ? (
                  <span className="breadcrumb-current">{project.name}</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setSplitter(null);
                      setPage("splitters");
                    }}
                  >
                    {project.name}
                  </button>
                )}
              </>
            )}

            {page === "links" && splitter && (
              <>
                <span>›</span>
                <span className="breadcrumb-current">{splitter.category}</span>
              </>
            )}
          </nav>
        )}

        {page === "projects" && <Projects onOpenProject={openProject} />}

        {page === "splitters" && project && (
          <Splitters project={project} onOpenSplitter={openSplitter} />
        )}

        {page === "links" && splitter && (
          <Links
            project={project}
            splitter={splitter}
            onSelectSplitter={openSplitterFrom}
          />
        )}

        {page === "admanager" && <AdManager />}

        {page === "settings" && <Settings user={user} />}
      </main>
    </div>
  );
}
