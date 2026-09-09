import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { api } from "../lib/apiClient";
import GamConnectionModal from "../components/GamConnectionModal";
import ConfirmDialog from "../components/ConfirmDialog";

function StatusBadge({ status }) {
  const map = {
    connected: ["badge-success", "conectado"],
    error: ["badge-danger", "erro"],
    pending: ["badge-warning", "não sincronizado"],
  };

  const [className, label] = map[status] || ["badge", status];

  return <span className={`badge ${className}`}>{label}</span>;
}

export default function AdManager() {
  const [connections, setConnections] = useState([]);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [campaigns, setCampaigns] = useState([]);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const [refreshKey, setRefreshKey] = useState(0);
  const reload = useCallback(() => setRefreshKey((key) => key + 1), []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [connectionsData, statusData] = await Promise.all([
          api("/api/gam/connections"),
          api("/api/gam/status"),
        ]);

        if (cancelled) return;
        setError("");
        setConnections(connectionsData);
        setStatus(statusData);
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
      await api(`/api/gam/connections/${editing.id}`, {
        method: "PUT",
        body: data,
      });
    } else {
      await api("/api/gam/connections", { method: "POST", body: data });
    }

    setEditing(null);
    reload();
  }

  async function handleSync(connectionId) {
    setSyncing(true);
    setError("");
    setNotice("");

    try {
      const result = await api(
        connectionId ? `/api/gam/sync/${connectionId}` : "/api/gam/sync",
        { method: "POST" }
      );

      if (result.skipped) {
        setNotice(result.reason);
        setCampaigns([]);
      } else {
        const found = result.campaigns?.length || 0;

        setNotice(
          `Sincronizado: ${result.matchedLinks} link(s) atualizado(s), ` +
            `${result.clearedLinks} zerado(s) por falta de entrega. ` +
            `O relatório trouxe ${found} campanha(s).`
        );

        // Nenhum link casou: mostrar o que veio no relatório é o que
        // permite cadastrar links com a utm_campaign certa.
        setCampaigns(result.matchedLinks === 0 ? result.campaigns || [] : []);
      }

    } catch (syncError) {
      setError(syncError.message);
    } finally {
      // Recarrega mesmo em caso de falha: é na linha da conexão que fica
      // o motivo do erro que o Google devolveu.
      reload();
      setSyncing(false);
    }
  }

  async function handleDelete() {
    setBusy(true);

    try {
      await api(`/api/gam/connections/${deleting.id}`, { method: "DELETE" });
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
          <h1 className="page-title">Ad Manager</h1>
          <p className="page-subtitle">
            Puxa eCPM e receita por utm_campaign para alimentar a otimização.
          </p>
        </div>

        <div className="btn-row">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => handleSync()}
            disabled={syncing || connections.length === 0}
          >
            <RefreshCw size={16} />
            {syncing ? "Sincronizando..." : "Sincronizar tudo"}
          </button>

          <button type="button" className="btn" onClick={() => setEditing({})}>
            <Plus size={16} />
            Nova conexão
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      {campaigns.length > 0 && (
        <div className="alert alert-info">
          <strong>Nenhum link casou com o relatório.</strong> Estas são as
          campanhas encontradas — use uma delas como{" "}
          <span className="mono">utm_campaign</span> nos seus links:
          <div className="campaign-list">
            {campaigns.map((campaign) => (
              <span className="badge mono" key={campaign}>
                {campaign}
              </span>
            ))}
          </div>
        </div>
      )}

      {status && !status.configured && (
        <div className="alert alert-info">
          Credenciais do Google ausentes. Defina{" "}
          <span className="mono">GAM_SERVICE_ACCOUNT_JSON</span> (conta de
          serviço, atende várias redes) ou{" "}
          <span className="mono">GAM_OAUTH_JSON</span> e{" "}
          <span className="mono">GAM_TOKEN_JSON</span> no{" "}
          <span className="mono">.env</span> para conseguir sincronizar.
        </div>
      )}

      {status?.authMode === "service_account" && (
        <div className="alert alert-info">
          Acessando por <strong>conta de serviço</strong>
          {status.serviceAccountEmail && (
            <>
              {" "}
              (<span className="mono">{status.serviceAccountEmail}</span>)
            </>
          )}
          . Cada rede só aparece aqui depois que esse e-mail for cadastrado
          nela, em Admin → Acesso e autorização → Contas de serviço.
        </div>
      )}

      {status?.authMode === "oauth" && (
        <div className="alert alert-info">
          Acessando por <strong>OAuth de usuário</strong> — vale para uma conta
          Google por vez. Para puxar várias redes de uma vez, troque por uma
          conta de serviço.
        </div>
      )}

      {status?.configured && (
        <div className="alert alert-info">
          Sincronização automática{" "}
          <strong>{status.autoSyncEnabled ? "ativa" : "desativada"}</strong>
          {status.autoSyncEnabled && (
            <>
              {" "}
              (<span className="mono">{status.cron}</span>)
            </>
          )}
          {status.lastSyncAt && (
            <>
              {" "}
              · última em{" "}
              {new Date(status.lastSyncAt).toLocaleString("pt-BR")}
            </>
          )}
        </div>
      )}

      {loading ? (
        <p className="loading">Carregando conexões...</p>
      ) : connections.length === 0 ? (
        <div className="empty-state">
          <h3>Nenhuma conexão cadastrada</h3>
          <p>
            Cadastre o network code e o ID de um relatório salvo no Ad Manager.
          </p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Network</th>
                <th>Relatório</th>
                <th>Chave</th>
                <th>Status</th>
                <th>Última sync</th>
                <th />
              </tr>
            </thead>

            <tbody>
              {connections.map((connection) => (
                <tr key={connection.id}>
                  <td>
                    {connection.name}
                    {!connection.active && (
                      <> <span className="badge">inativa</span></>
                    )}
                  </td>

                  <td className="mono">{connection.networkCode}</td>
                  <td className="mono">{connection.reportId || "—"}</td>
                  <td className="mono">{connection.reportType}</td>

                  <td>
                    <StatusBadge status={connection.status} />
                    {connection.lastError && (
                      // A mensagem do Google costuma ser a única pista do que
                      // está errado: cabe inteira, sem corte.
                      <div
                        className="field-hint error-detail"
                        title={connection.lastError}
                      >
                        {connection.lastError}
                      </div>
                    )}
                  </td>

                  <td className="muted">
                    {connection.lastSyncAt
                      ? new Date(connection.lastSyncAt).toLocaleString("pt-BR")
                      : "nunca"}
                  </td>

                  <td>
                    <div className="btn-row">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleSync(connection.id)}
                        disabled={syncing}
                        aria-label="Sincronizar"
                      >
                        <RefreshCw size={14} />
                      </button>

                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setEditing(connection)}
                        aria-label="Editar"
                      >
                        <Pencil size={14} />
                      </button>

                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setDeleting(connection)}
                        aria-label="Excluir"
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
      )}

      {editing && (
        <GamConnectionModal
          connection={editing.id ? editing : null}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Excluir conexão"
          message={`A conexão "${deleting.name}" deixa de alimentar a otimização. Os dados já sincronizados nos links continuam.`}
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
          busy={busy}
        />
      )}
    </>
  );
}
