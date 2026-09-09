import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { api } from "../lib/apiClient";

const hora = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
});

const dataHora = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/** "às 14:03" quando é de hoje; senão a data inteira. */
function quando(iso) {
  const momento = new Date(iso);
  if (Number.isNaN(momento.getTime())) return null;

  const hoje = new Date();
  const mesmoDia =
    momento.getFullYear() === hoje.getFullYear() &&
    momento.getMonth() === hoje.getMonth() &&
    momento.getDate() === hoje.getDate();

  return mesmoDia ? `às ${hora.format(momento)}` : dataHora.format(momento);
}

/**
 * Puxa os números do Google Ad Manager na hora e mostra quando foi a última
 * atualização. O sync automático roda de hora em hora no servidor; este
 * botão serve para não precisar esperar a próxima rodada.
 */
export default function GamSyncButton({ onSynced }) {
  const [status, setStatus] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [erro, setErro] = useState("");

  // Recarrega sozinho: o sync automático acontece no servidor, então o
  // painel precisa olhar de tempos em tempos para o horário não envelhecer
  // na tela.
  useEffect(() => {
    let cancelado = false;

    const puxar = async () => {
      try {
        const dados = await api("/api/gam/status");
        if (!cancelado) setStatus(dados);
      } catch {
        /* status é informativo: falhar aqui não atrapalha o painel */
      }
    };

    (async () => {
      await puxar();
    })();

    const timer = setInterval(puxar, 60000);

    return () => {
      cancelado = true;
      clearInterval(timer);
    };
  }, []);

  async function sincronizar() {
    setSyncing(true);
    setErro("");

    try {
      await api("/api/gam/sync", { method: "POST" });
      setStatus(await api("/api/gam/status"));
      onSynced?.();
    } catch (error) {
      setErro(error.message);
    } finally {
      setSyncing(false);
    }
  }

  const configurado = status?.configured !== false;
  const ultima = status?.lastSyncAt ? quando(status.lastSyncAt) : null;

  return (
    <div className="gam-sync">
      <button
        type="button"
        className="btn btn-secondary"
        onClick={sincronizar}
        disabled={syncing || !configurado}
        title={
          configurado
            ? "Puxa eCPM, impressões e receita do Google Ad Manager agora"
            : "Configure as credenciais do GAM em Ad Manager"
        }
      >
        <RefreshCw size={16} className={syncing ? "is-spinning" : ""} />
        {syncing ? "Sincronizando..." : "Google Ad Manager"}
      </button>

      <span className="gam-sync-hint">
        {erro
          ? erro
          : !configurado
            ? "sem credenciais"
            : ultima
              ? `atualizado ${ultima}`
              : "ainda não sincronizado"}
        {status?.autoSyncEnabled && configurado && " · automático de 1h em 1h"}
      </span>
    </div>
  );
}
