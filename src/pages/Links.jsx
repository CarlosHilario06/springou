import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Pencil, Plus, Trash2, Zap } from "lucide-react";
import { api } from "../lib/apiClient";
import LinkModal from "../components/LinkModal";
import RouteModal from "../components/RouteModal";
import ConfirmDialog from "../components/ConfirmDialog";
import SplitterSwitcher from "../components/SplitterSwitcher";

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "USD",
});

const decimal = new Intl.NumberFormat("pt-BR");

/** Fatia travada à mão — o campo vazio volta a ser automático. */
function isLocked(row) {
  return (
    row.fixedProbability !== null &&
    row.fixedProbability !== undefined &&
    row.fixedProbability !== ""
  );
}

function readCampaign(link) {
  return link.utms?.utm_campaign || "";
}

export default function Links({ project, splitter, onSelectSplitter }) {
  const [view, setView] = useState("links");
  const [tabs, setTabs] = useState([]);
  const [activeTab, setActiveTab] = useState(null);
  const [links, setLinks] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [optimizing, setOptimizing] = useState(false);

  // Edição inline: guarda só o que mudou, em cima do que veio do servidor.
  // Assim nenhum efeito precisa copiar a lista para o estado — o que o
  // compilador do React acusaria como cascata de renderizações.
  const [drafts, setDrafts] = useState({});
  const [newRows, setNewRows] = useState([]);
  const [removedIds, setRemovedIds] = useState([]);
  const [saving, setSaving] = useState(false);

  const [editingLink, setEditingLink] = useState(null);
  const [editingRoute, setEditingRoute] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [busy, setBusy] = useState(false);

  const [refreshKey, setRefreshKey] = useState(0);
  const reload = useCallback(() => setRefreshKey((key) => key + 1), []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [tabsData, linksData, routesData] = await Promise.all([
          api(`/api/splitters/${splitter.id}/tabs`),
          api(`/api/splitters/${splitter.id}/links`),
          api(`/api/splitters/${splitter.id}/routes`),
        ]);

        if (cancelled) return;

        setError("");
        setTabs(tabsData);
        setLinks(linksData);
        setRoutes(routesData);

        // A aba ativa pode ter sido renomeada ou removida na última ação.
        setActiveTab((current) => {
          const stillExists = tabsData.some((item) => item.tab === current);
          return stillExists ? current : tabsData[0]?.tab ?? null;
        });
      } catch (loadError) {
        if (!cancelled) setError(loadError.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [splitter.id, refreshKey]);

  const tabLinks = useMemo(
    () => links.filter((link) => link.tab === activeTab),
    [links, activeTab]
  );

  const tabRoutes = useMemo(
    () => routes.filter((route) => route.tab === activeTab),
    [routes, activeTab]
  );

  const totals = useMemo(
    () =>
      tabLinks.reduce(
        (acc, link) => ({
          visits: acc.visits + link.visits,
          impressions: acc.impressions + link.impressions,
          revenue: acc.revenue + link.revenue,
        }),
        { visits: 0, impressions: 0, revenue: 0 }
      ),
    [tabLinks]
  );

  const visibleLinks = tabLinks.filter((link) => !removedIds.includes(link.id));

  const rows = [
    ...visibleLinks.map((link) => ({ ...link, ...(drafts[link.id] || {}) })),
    ...newRows,
  ];

  const isDirty =
    Object.keys(drafts).length > 0 ||
    newRows.length > 0 ||
    removedIds.length > 0;

  function editRow(row, field, value) {
    if (row.tempId) {
      setNewRows((current) =>
        current.map((item) =>
          item.tempId === row.tempId ? { ...item, [field]: value } : item
        )
      );
      return;
    }

    setDrafts((current) => ({
      ...current,
      [row.id]: { ...(current[row.id] || {}), [field]: value },
    }));
  }

  function removeRow(row) {
    if (row.tempId) {
      setNewRows((current) =>
        current.filter((item) => item.tempId !== row.tempId)
      );
      return;
    }

    setDrafts((current) => {
      const next = { ...current };
      delete next[row.id];
      return next;
    });
    setRemovedIds((current) => [...current, row.id]);
  }

  function addRow() {
    setNewRows((current) => [
      ...current,
      { tempId: `novo-${Date.now()}-${current.length}`, url: "", disabled: false },
    ]);
  }

  function discardChanges() {
    setDrafts({});
    setNewRows([]);
    setRemovedIds([]);
  }

  async function saveRows() {
    setSaving(true);

    try {
      await run(
        () =>
          api(`/api/splitters/${splitter.id}/links`, {
            method: "PUT",
            body: {
              tab: activeTab,
              links: rows.map((row) => ({
                id: row.tempId ? undefined : row.id,
                url: row.url,
                disabled: Boolean(row.disabled),
                fixedProbability: isLocked(row)
                  ? Number(row.fixedProbability)
                  : null,
              })),
            },
          }),
        "Links salvos."
      );
      discardChanges();
    } catch {
      /* mensagem já exibida */
    } finally {
      setSaving(false);
    }
  }

  function flash(message) {
    setNotice(message);
    setTimeout(() => setNotice(""), 3500);
  }

  async function run(action, successMessage) {
    setError("");

    try {
      await action();
      reload();
      if (successMessage) flash(successMessage);
    } catch (actionError) {
      setError(actionError.message);
      throw actionError;
    }
  }

  async function handleOptimize() {
    setOptimizing(true);

    try {
      await run(
        () => api(`/api/splitters/${splitter.id}/optimize`, { method: "POST" }),
        "Distribuição de tráfego recalculada."
      );
    } catch {
      /* mensagem já exibida */
    } finally {
      setOptimizing(false);
    }
  }

  async function handleAddTab() {
    const name = window.prompt("Nome da nova aba:");
    if (!name?.trim()) return;

    try {
      await run(
        () =>
          api(`/api/splitters/${splitter.id}/tabs`, {
            method: "POST",
            body: { tab: name.trim() },
          }),
        "Aba criada."
      );
      setActiveTab(name.trim());
    } catch {
      /* mensagem já exibida */
    }
  }

  async function handleRenameTab() {
    const name = window.prompt("Novo nome da aba:", activeTab);
    if (!name?.trim() || name.trim() === activeTab) return;

    try {
      await run(
        () =>
          api(`/api/splitters/${splitter.id}/tabs/${encodeURIComponent(activeTab)}`, {
            method: "PUT",
            body: { tab: name.trim() },
          }),
        "Aba renomeada."
      );
      setActiveTab(name.trim());
    } catch {
      /* mensagem já exibida */
    }
  }

  async function handleConfirmDelete() {
    setBusy(true);

    try {
      await run(async () => {
        if (pendingDelete.kind === "link") {
          await api(`/api/links/${pendingDelete.id}`, { method: "DELETE" });
        } else if (pendingDelete.kind === "route") {
          await api(`/api/routes/${pendingDelete.id}`, { method: "DELETE" });
        } else {
          await api(
            `/api/splitters/${splitter.id}/tabs/${encodeURIComponent(activeTab)}`,
            { method: "DELETE" }
          );
        }
      });
      setPendingDelete(null);
    } catch {
      setPendingDelete(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveLink(data) {
    await run(() =>
      editingLink?.id
        ? api(`/api/links/${editingLink.id}`, { method: "PUT", body: data })
        : api(`/api/splitters/${splitter.id}/links`, {
            method: "POST",
            body: data,
          })
    );

    setEditingLink(null);
  }

  async function handleSaveRoute(data) {
    await run(() =>
      editingRoute?.id
        ? api(`/api/routes/${editingRoute.id}`, { method: "PUT", body: data })
        : api(`/api/splitters/${splitter.id}/routes`, {
            method: "POST",
            body: data,
          })
    );

    setEditingRoute(null);
  }

  async function copyRoute(route) {
    const url = `https://${route.domain}/go/${route.slug}`;

    try {
      await navigator.clipboard.writeText(url);
      flash("Link copiado.");
    } catch {
      window.prompt("Copie o link:", url);
    }
  }

  if (loading) return <p className="loading">Carregando splitter...</p>;

  const deleteCopy = {
    link: {
      title: "Excluir link",
      message:
        "O link sai do sorteio e o histórico de visitas dele é perdido. Essa ação não pode ser desfeita.",
    },
    route: {
      title: "Excluir rota",
      message:
        "O endereço público para de funcionar imediatamente. Essa ação não pode ser desfeita.",
    },
    tab: {
      title: "Excluir aba",
      message: `Excluir a aba "${activeTab}" remove todos os links dela. Essa ação não pode ser desfeita.`,
    },
  };

  return (
    <>
      <div className="page-header">
        <div>
          <SplitterSwitcher
            project={project}
            splitter={splitter}
            onSelect={onSelectSplitter}
          />

          <p className="page-subtitle">
            {totals.visits > 0
              ? `${decimal.format(totals.visits)} visitas · ${decimal.format(
                  totals.impressions
                )} impressões · ${currency.format(totals.revenue)} nesta aba`
              : "Ainda sem visitas registradas nesta aba."}
          </p>
        </div>

        <div className="btn-row">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleOptimize}
            disabled={optimizing || tabLinks.length === 0}
            title="Recalcula a divisão de tráfego a partir do eCPM"
          >
            <Zap size={16} />
            {optimizing ? "Otimizando..." : "Otimizar tráfego"}
          </button>

          {view === "links" ? (
            <button
              type="button"
              className="btn"
              onClick={() => setEditingLink({})}
              disabled={!activeTab}
            >
              <Plus size={16} />
              Novo link
            </button>
          ) : (
            <button
              type="button"
              className="btn"
              onClick={() => setEditingRoute({})}
              disabled={!activeTab}
            >
              <Plus size={16} />
              Nova rota
            </button>
          )}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      <div className="tabs">
        {tabs.map((item) => (
          <button
            key={item.tab}
            type="button"
            className={item.tab === activeTab ? "tab is-active" : "tab"}
            onClick={() => setActiveTab(item.tab)}
          >
            {item.tab}
          </button>
        ))}

        <button type="button" className="tab" onClick={handleAddTab}>
          <Plus size={14} />
          Aba
        </button>

        {activeTab && (
          <>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleRenameTab}
            >
              <Pencil size={14} />
              Renomear
            </button>

            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setPendingDelete({ kind: "tab" })}
              disabled={tabs.length <= 1}
            >
              <Trash2 size={14} />
              Excluir aba
            </button>
          </>
        )}
      </div>

      <div className="tabs">
        <button
          type="button"
          className={view === "links" ? "tab is-active" : "tab"}
          onClick={() => setView("links")}
        >
          Links ({tabLinks.length})
        </button>

        <button
          type="button"
          className={view === "routes" ? "tab is-active" : "tab"}
          onClick={() => setView("routes")}
        >
          Rotas ({tabRoutes.length})
        </button>
      </div>

      {view === "links" ? (
        tabLinks.length === 0 ? (
          <div className="empty-state">
            <h3>Nenhum link nesta aba</h3>
            <p>Cadastre os links que vão disputar o tráfego desta aba.</p>

            <button
              type="button"
              className="btn"
              onClick={() => setEditingLink({})}
              disabled={!activeTab}
            >
              <Plus size={16} />
              Novo link
            </button>
          </div>
        ) : (
          <>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th style={{ minWidth: 320 }}>URL de destino</th>
                  <th>utm_campaign</th>
                  <th className="td-numeric">eCPM</th>
                  <th className="td-numeric">Impr.</th>
                  <th className="td-numeric">Receita</th>
                  <th className="td-numeric">Visitas</th>
                  <th style={{ minWidth: 190 }}>Tráfego</th>
                  <th style={{ width: 70 }}>Oculto</th>
                  <th />
                </tr>
              </thead>

              <tbody>
                {rows.map((row) => {
                  const isNew = Boolean(row.tempId);

                  return (
                    <tr
                      key={row.tempId || row.id}
                      className={row.disabled ? "row-disabled" : ""}
                    >
                      <td>
                        <input
                          type="url"
                          className="cell-input"
                          value={row.url}
                          onChange={(event) =>
                            editRow(row, "url", event.target.value)
                          }
                          placeholder="https://destino.com/pagina?utm_campaign=..."
                          title={row.url}
                        />
                        {row.type && (
                          <div className="url-cell-tags">
                            <span className="badge">{row.type}</span>
                          </div>
                        )}
                      </td>

                      <td className="mono">
                        {isNew ? (
                          <span className="muted">lida da URL</span>
                        ) : (
                          readCampaign(row) || "—"
                        )}
                      </td>

                      <td className="td-numeric">
                        {isNew ? "—" : currency.format(row.ecpm)}
                      </td>

                      <td className="td-numeric">
                        {isNew ? "—" : decimal.format(row.impressions)}
                      </td>

                      <td className="td-numeric">
                        {isNew ? "—" : currency.format(row.revenue)}
                      </td>

                      <td className="td-numeric">
                        {isNew ? "—" : decimal.format(row.visits)}
                      </td>

                      <td>
                        {isNew ? (
                          <span className="muted">—</span>
                        ) : (
                          <div className="share-cell">
                            <div className="share-bar">
                              <span style={{ width: `${row.probability}%` }} />
                            </div>

                            {/* A própria fatia é o campo: mostra o que o
                                algoritmo calculou e aceita ser sobrescrita. */}
                            <span
                              className={
                                isLocked(row)
                                  ? "share-input is-locked"
                                  : "share-input"
                              }
                            >
                              <input
                                type="number"
                                value={
                                  row.fixedProbability ??
                                  Number(row.probability).toFixed(1)
                                }
                                onChange={(event) =>
                                  editRow(
                                    row,
                                    "fixedProbability",
                                    event.target.value
                                  )
                                }
                                min="0"
                                max="100"
                                title={
                                  isLocked(row)
                                    ? "Fatia travada. Apague para voltar ao automático."
                                    : "Calculado pelo eCPM. Digite para travar."
                                }
                              />
                              %
                            </span>
                          </div>
                        )}
                      </td>

                      <td>
                        <input
                          type="checkbox"
                          checked={Boolean(row.disabled)}
                          onChange={(event) =>
                            editRow(row, "disabled", event.target.checked)
                          }
                          aria-label="Ocultar do sorteio"
                        />
                      </td>

                      <td>
                        <div className="btn-row">
                          {!isNew && (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => setEditingLink(row)}
                              aria-label="Editar tipo, aba e UTMs"
                              title="Tipo, aba e UTMs"
                            >
                              <Pencil size={14} />
                            </button>
                          )}

                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => removeRow(row)}
                            aria-label="Remover"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="table-footer-action">
            <button type="button" className="btn btn-secondary" onClick={addRow}>
              <Plus size={16} />
              Adicionar URL
            </button>

            {isDirty && (
              <>
                <button
                  type="button"
                  className="btn"
                  onClick={saveRows}
                  disabled={saving}
                >
                  {saving ? "Salvando..." : "Salvar URLs"}
                </button>

                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={discardChanges}
                  disabled={saving}
                >
                  Descartar
                </button>

                <span className="muted">Alterações não salvas</span>
              </>
            )}
          </div>
        </>
        )
      ) : tabRoutes.length === 0 ? (
        <div className="empty-state">
          <h3>Nenhuma rota nesta aba</h3>
          <p>
            A rota é o endereço público que sorteia um link desta aba —
            é o link que você divulga.
          </p>

          <button
            type="button"
            className="btn"
            onClick={() => setEditingRoute({})}
            disabled={!activeTab}
          >
            <Plus size={16} />
            Nova rota
          </button>
        </div>
      ) : (
        <>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Endereço público</th>
                <th>Pixel</th>
                <th>Loader</th>
                <th />
              </tr>
            </thead>

            <tbody>
              {tabRoutes.map((route) => (
                <tr
                  key={route.id}
                  className="row-clickable"
                  onClick={() => setEditingRoute(route)}
                  title="Clique para editar"
                >
                  <td className="mono">
                    {route.domain}/go/{route.slug}
                  </td>

                  <td>
                    {route.pixelId ? (
                      <span className="mono">{route.pixelId}</span>
                    ) : (
                      <span className="muted">padrão</span>
                    )}
                  </td>

                  <td className="td-url">{route.loaderTitle || "—"}</td>

                  <td onClick={(event) => event.stopPropagation()}>
                    <div className="btn-row">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => copyRoute(route)}
                        aria-label="Copiar link"
                      >
                        <Copy size={14} />
                      </button>

                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setEditingRoute(route)}
                        aria-label="Editar rota"
                      >
                        <Pencil size={14} />
                      </button>

                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() =>
                          setPendingDelete({ kind: "route", id: route.id })
                        }
                        aria-label="Excluir rota"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="table-footer-action">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setEditingRoute({})}
            disabled={!activeTab}
          >
            <Plus size={16} />
            Nova rota
          </button>
        </div>
        </>
      )}

      {editingLink && (
        <LinkModal
          link={editingLink.id ? editingLink : null}
          tabs={tabs}
          currentTab={activeTab}
          onSave={handleSaveLink}
          onClose={() => setEditingLink(null)}
        />
      )}

      {editingRoute && (
        <RouteModal
          route={editingRoute.id ? editingRoute : null}
          tabs={tabs}
          currentTab={activeTab}
          onSave={handleSaveRoute}
          onClose={() => setEditingRoute(null)}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={deleteCopy[pendingDelete.kind].title}
          message={deleteCopy[pendingDelete.kind].message}
          onConfirm={handleConfirmDelete}
          onCancel={() => setPendingDelete(null)}
          busy={busy}
        />
      )}
    </>
  );
}
