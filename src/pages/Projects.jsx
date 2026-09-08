import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "../lib/apiClient";
import ProjectModal from "../components/ProjectModal";
import ConfirmDialog from "../components/ConfirmDialog";

export default function Projects({ onOpenProject }) {
  const [projects, setProjects] = useState([]);
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
        const data = await api("/api/projects");
        if (cancelled) return;
        setProjects(data);
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
  }, [refreshKey]);

  async function handleSave(data) {
    if (editing?.id) {
      await api(`/api/projects/${editing.id}`, { method: "PUT", body: data });
    } else {
      await api("/api/projects", { method: "POST", body: data });
    }

    setEditing(null);
    reload();
  }

  async function handleDelete() {
    setBusy(true);

    try {
      await api(`/api/projects/${deleting.id}`, { method: "DELETE" });
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
          <h1 className="page-title">Projetos</h1>
          <p className="page-subtitle">
            Cada projeto agrupa os splitters de uma operação.
          </p>
        </div>

        <button type="button" className="btn" onClick={() => setEditing({})}>
          <Plus size={16} />
          Novo projeto
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <p className="loading">Carregando projetos...</p>
      ) : projects.length === 0 ? (
        <div className="empty-state">
          <h3>Nenhum projeto ainda</h3>
          <p>Crie o primeiro projeto para começar a montar seus splits.</p>
        </div>
      ) : (
        <div className="card-grid">
          {projects.map((project) => (
            <div
              key={project.id}
              className="card card-clickable"
              onClick={() => onOpenProject(project)}
            >
              <span className="card-title">{project.name}</span>

              <div className="card-meta">
                <span>
                  {project.splittersCount}{" "}
                  {project.splittersCount === 1 ? "splitter" : "splitters"}
                </span>
                <span>
                  Criado em{" "}
                  {new Date(project.createdAt).toLocaleDateString("pt-BR")}
                </span>
              </div>

              <div
                className="card-actions"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setEditing(project)}
                >
                  <Pencil size={14} />
                  Editar
                </button>

                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setDeleting(project)}
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
        <ProjectModal
          project={editing.id ? editing : null}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Excluir projeto"
          message={`Excluir "${deleting.name}" remove também todos os seus splitters, links e rotas. Essa ação não pode ser desfeita.`}
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
          busy={busy}
        />
      )}
    </>
  );
}
