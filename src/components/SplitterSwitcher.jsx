import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { api } from "../lib/apiClient";

/** Cor estável por projeto, para o olho agrupar sem precisar ler. */
function projectColor(projectId) {
  return `hsl(${(projectId * 67) % 360} 70% 60%)`;
}

/**
 * Seletor no topo da página: lista os splitters agrupados por projeto e
 * pula direto para o escolhido, sem passar pela lista de projetos.
 */
export default function SplitterSwitcher({ project, splitter, onSelect }) {
  const [open, setOpen] = useState(false);
  const [tree, setTree] = useState([]);
  const [error, setError] = useState("");
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    let cancelled = false;

    (async () => {
      try {
        const data = await api("/api/projects/tree");
        if (!cancelled) setTree(data);
      } catch (loadError) {
        if (!cancelled) setError(loadError.message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  // Fecha ao clicar fora ou apertar Esc, como qualquer menu.
  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event) {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="switcher" ref={containerRef}>
      <button
        type="button"
        className="switcher-trigger"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <span
          className="switcher-dot"
          style={{ background: projectColor(project.id) }}
        />
        <span className="switcher-label">{splitter.category}</span>
        <ChevronDown size={16} className="switcher-chevron" />
      </button>

      {open && (
        <div className="switcher-panel">
          {error && <div className="alert alert-error">{error}</div>}

          {tree.length === 0 && !error && (
            <p className="switcher-empty">Carregando...</p>
          )}

          {tree.map((item) => (
            <div key={item.id} className="switcher-group">
              <span className="switcher-group-title">{item.name}</span>

              {item.splitters.length === 0 ? (
                <span className="switcher-empty">nenhum splitter</span>
              ) : (
                item.splitters.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={
                      option.id === splitter.id
                        ? "switcher-item is-current"
                        : "switcher-item"
                    }
                    onClick={() => {
                      setOpen(false);
                      if (option.id !== splitter.id) onSelect(item, option);
                    }}
                  >
                    <span
                      className="switcher-dot"
                      style={{ background: projectColor(item.id) }}
                    />
                    <span>
                      {option.category}
                      {option.location && (
                        <span className="muted"> · {option.location}</span>
                      )}
                    </span>
                  </button>
                ))
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
