import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "../lib/apiClient";
import SplitterModal from "../components/SplitterModal";
import ConfirmDialog from "../components/ConfirmDialog";

export default function Splitters({ project, onOpenSplitter }) {
  const [splitters, setSplitters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const [refreshKey, setRefreshKey] = useState(0);
  const reload = useCallback(() => setRefreshKey((key) => key + 1), []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await api(`/api/projects/${project.id}/splitters`);
        if (cancelled) return;
        setSplitters(data);
        setError("");
      } catch (loadError) {
        if (!cancelled) setError(loadError.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [project.id, refreshKey]);

  async function handleSave(data) {
    if (editing?.id) {
      await api(`/api/splitters/${editing.id}`, { method: "PUT", body: data });
    } else {
      await api(`/api/projects/${project.id}/splitters`, {
        method: "POST",
        body: data,
      });
    }

    setEditing(null);
    reload();
  }

  async function handleDelete() {
    setBusy(true);

    try {
      await api(`/api/splitters/${deleting.id}`, { method: "DELETE" });
      setDeleting(null);
      reload();
    } catch (deleteError) {
      setError(deleteError.message);
      setDeleting(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">{project.name}</h1>
          <p className="page-subtitle">
            Splitters distribuem o tráfego entre os links de cada aba.
          </p>
        </div>

        <button type="button" className="btn" onClick={() => setEditing({})}>
          <Plus size={16} />
          Novo splitter
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <p className="loading">Carregando splitters...</p>
      ) : splitters.length === 0 ? (
        <div className="empty-state">
          <h3>Nenhum splitter neste projeto</h3>
          <p>Crie um splitter para cadastrar links e rotas de redirect.</p>
        </div>
      ) : (
        <div className="card-grid">
          {splitters.map((splitter) => (
            <div
              key={splitter.id}
              className="card card-clickable"
              onClick={() => onOpenSplitter(splitter)}
            >
              <span className="card-title">{splitter.category}</span>

              <div className="card-meta">
                {splitter.location && <span>{splitter.location}</span>}
                <span>{splitter.linksCount} links</span>
                <span>{splitter.routesCount} rotas</span>
                <span>{splitter.tabs.length} abas</span>
              </div>

              <div
                className="card-actions"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setEditing(splitter)}
                >
                  <Pencil size={14} />
                  Editar
                </button>

                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setDeleting(splitter)}
                >
                  <Trash2 size={14} />
                  Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <SplitterModal
          splitter={editing.id ? editing : null}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Excluir splitter"
          message={`Excluir "${deleting.category}" remove seus links, abas e rotas. Essa ação não pode ser desfeita.`}
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
          busy={busy}
        />
      )}
    </>
  );
}
