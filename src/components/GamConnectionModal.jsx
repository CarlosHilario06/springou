import { useState } from "react";
import Modal from "./Modal";
import { api } from "../lib/apiClient";

const DATE_RANGES = [
  { value: "TODAY", label: "Hoje" },
  { value: "YESTERDAY", label: "Ontem" },
  { value: "LAST_7_DAYS", label: "Últimos 7 dias" },
  { value: "LAST_30_DAYS", label: "Últimos 30 dias" },
  { value: "THIS_MONTH_TO_DATE", label: "Este mês até hoje" },
  { value: "LAST_MONTH", label: "Mês passado" },
];

const REPORT_TYPES = [
  { value: "utm_campaign", label: "utm_campaign (padrão)" },
  { value: "utm_source", label: "utm_source" },
  { value: "utm_medium", label: "utm_medium" },
  { value: "utm_content", label: "utm_content" },
];

/** O que cada tentativa respondeu, em uma linha só. */
function resumoDasTentativas(attempts = []) {
  const aceitas = attempts.filter((item) => item.ok).map((item) => item.rotulo);
  const recusadas = attempts.filter((item) => !item.ok);

  const partes = [];

  if (aceitas.length > 0) partes.push(`Aceitou: ${aceitas.join(", ")}.`);

  if (recusadas.length > 0) {
    // O motivo costuma ser o mesmo em todas; mostrar uma vez basta.
    const motivos = [...new Set(recusadas.map((item) => item.motivo))];

    partes.push(
      `Recusou: ${recusadas.map((item) => item.rotulo).join(", ")}. ` +
        `Motivo: ${motivos.join(" / ")}`
    );
  }

  return partes.join(" ");
}

export default function GamConnectionModal({ connection, onSave, onClose }) {
  const [name, setName] = useState(connection?.name || "");
  const [networkCode, setNetworkCode] = useState(connection?.networkCode || "");
  const [reportId, setReportId] = useState(connection?.reportId || "");
  const [reportType, setReportType] = useState(
    connection?.reportType || "utm_campaign"
  );
  const [reportRange, setReportRange] = useState(
    connection?.reportRange || "LAST_7_DAYS"
  );
  const [active, setActive] = useState(connection ? connection.active : true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Relatório salvo tem dono no GAM: o ID que aparece no painel do operador
  // pode não existir para a credencial. Buscar a lista tira o adivinhação.
  const [reports, setReports] = useState(null);
  const [loadingReports, setLoadingReports] = useState(false);
  const [creatingReport, setCreatingReport] = useState(false);
  const [notice, setNotice] = useState("");

  async function handleListReports() {
    setLoadingReports(true);
    setError("");

    try {
      const found = await api(
        `/api/gam/networks/${encodeURIComponent(networkCode.trim())}/reports`
      );

      setReports(found);

      if (found.length === 0) {
        setError(
          "A credencial não enxerga nenhum relatório nesta rede. No GAM, " +
            "compartilhe o relatório com todos da rede — relatório salvo é " +
            "privado de quem criou."
        );
      }
    } catch (listError) {
      setError(listError.message);
      setReports(null);
    } finally {
      setLoadingReports(false);
    }
  }

  /**
   * Cria o relatório pela API. Ele nasce pertencendo à conta de serviço,
   * já com as dimensões e métricas que o sincronizador espera — o caminho
   * que não depende de compartilhar nada na interface do GAM.
   */
  async function handleCreateReport() {
    setCreatingReport(true);
    setError("");
    setNotice("");

    try {
      const created = await api(
        `/api/gam/networks/${encodeURIComponent(networkCode.trim())}/reports`,
        { method: "POST", body: { reportType, reportRange } }
      );

      setReports(null);

      if (!created.usable) {
        // O relatório existe, mas a rede não aceitou nenhuma forma que o
        // sincronizador lê. Não adianta gravar o ID: a conexão diria
        // "conectado" e sincronizaria vazio.
        setNotice("");
        setError(
          "A rede não aceitou nenhum formato que o sincronizador lê. " +
            resumoDasTentativas(created.attempts)
        );
        return;
      }

      setReportId(created.id);
      setNotice(
        `Relatório "${created.name}" pronto (${created.id}), no formato ` +
          `"${created.variant}". Salve para usar.`
      );
    } catch (createError) {
      setError(createError.message);
    } finally {
      setCreatingReport(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSaving(true);

    try {
      await onSave({
        name: name.trim(),
        networkCode: networkCode.trim(),
        reportId: reportId.trim(),
        reportType,
        reportRange,
        active,
      });
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={connection ? "Editar conexão" : "Nova conexão do Ad Manager"}
      subtitle="Aponta para um relatório salvo no GAM, com a chave-valor da UTM."
      onClose={onClose}
    >
      <form onSubmit={handleSubmit}>
        {error && <div className="alert alert-error">{error}</div>}
        {notice && <div className="alert alert-success">{notice}</div>}

        <div className="field">
          <label htmlFor="gam-name">Nome</label>
          <input
            id="gam-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex.: Rede principal"
            autoFocus
            required
          />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="gam-network">Network code</label>
            <input
              id="gam-network"
              type="text"
              value={networkCode}
              onChange={(event) => setNetworkCode(event.target.value)}
              placeholder="23174459617"
              inputMode="numeric"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="gam-report">Report ID</label>

            {reports?.length > 0 ? (
              <select
                id="gam-report"
                value={reportId}
                onChange={(event) => setReportId(event.target.value)}
              >
                <option value="">Escolha um relatório</option>
                {reports.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} — {item.id}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id="gam-report"
                type="text"
                value={reportId}
                onChange={(event) => setReportId(event.target.value)}
                placeholder="7460106012"
                inputMode="numeric"
              />
            )}

            <div className="btn-row">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleListReports}
                disabled={loadingReports || creatingReport || !networkCode.trim()}
              >
                {loadingReports ? "Buscando..." : "Buscar relatórios"}
              </button>

              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleCreateReport}
                disabled={creatingReport || loadingReports || !networkCode.trim()}
                title="Cria na rede um relatório já no formato certo, pertencente à conta de serviço"
              >
                {creatingReport ? "Criando..." : "Criar relatório"}
              </button>
            </div>
          </div>
        </div>

        <div className="field">
          <label htmlFor="gam-range">Período</label>
          <select
            id="gam-range"
            value={reportRange}
            onChange={(event) => setReportRange(event.target.value)}
          >
            {DATE_RANGES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <span className="field-hint">
            A janela que o relatório soma. Mudou aqui? Clique em "Criar
            relatório" de novo para o relatório acompanhar.
          </span>
        </div>

        <div className="field">
          <label htmlFor="gam-report-type">Chave do relatório</label>
          <select
            id="gam-report-type"
            value={reportType}
            onChange={(event) => setReportType(event.target.value)}
          >
            {REPORT_TYPES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <span className="field-hint">
            Precisa bater com a dimensão chave-valor configurada no relatório.
          </span>
        </div>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={active}
            onChange={(event) => setActive(event.target.checked)}
          />
          Incluir na sincronização automática
        </label>

        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>

          <button
            type="submit"
            className="btn"
            disabled={saving || !name.trim() || !networkCode.trim()}
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
