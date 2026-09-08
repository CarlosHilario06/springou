import { useState } from "react";
import Modal from "./Modal";

const UTM_FIELDS = [
  { key: "utm_source", label: "utm_source", placeholder: "facebook" },
  { key: "utm_medium", label: "utm_medium", placeholder: "cpc" },
  { key: "utm_campaign", label: "utm_campaign", placeholder: "black-friday" },
  { key: "utm_content", label: "utm_content", placeholder: "criativo-01" },
  { key: "utm_term", label: "utm_term", placeholder: "palavra-chave" },
  { key: "utm_id", label: "utm_id", placeholder: "12345" },
];

export default function LinkModal({ link, tabs, currentTab, onSave, onClose }) {
  const [url, setUrl] = useState(link?.url || "");
  const [type, setType] = useState(link?.type || "");
  const [tab, setTab] = useState(link?.tab || currentTab || "1");
  const [disabled, setDisabled] = useState(Boolean(link?.disabled));
  const [utms, setUtms] = useState(() => ({ ...(link?.utms || {}) }));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function updateUtm(key, value) {
    setUtms((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSaving(true);

    try {
      await onSave({ url: url.trim(), type: type.trim(), tab, disabled, utms });
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={link ? "Editar link" : "Novo link"}
      subtitle="A utm_campaign é a chave que casa este link com o relatório do Ad Manager."
      onClose={onClose}
      wide
    >
      <form onSubmit={handleSubmit}>
        {error && <div className="alert alert-error">{error}</div>}

        <div className="field">
          <label htmlFor="link-url">URL de destino</label>
          <input
            id="link-url"
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://oferta.exemplo.com/pagina"
            autoFocus
            required
          />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="link-type">Tipo (opcional)</label>
            <input
              id="link-type"
              type="text"
              value={type}
              onChange={(event) => setType(event.target.value)}
              placeholder="Ex.: advertorial"
            />
          </div>

          <div className="field">
            <label htmlFor="link-tab">Aba</label>
            <select
              id="link-tab"
              value={tab}
              onChange={(event) => setTab(event.target.value)}
            >
              {tabs.map((item) => (
                <option key={item.tab} value={item.tab}>
                  {item.tab}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={disabled}
            onChange={(event) => setDisabled(event.target.checked)}
          />
          Desativado (fica fora do sorteio)
        </label>

        <h3 className="modal-section-title">UTMs</h3>

        <p className="field-hint" style={{ marginBottom: 12 }}>
          Aplicadas na URL no momento do redirect. Campos em branco são ignorados.
        </p>

        <div className="field-row">
          {UTM_FIELDS.map((field) => (
            <div className="field" key={field.key}>
              <label htmlFor={`utm-${field.key}`}>{field.label}</label>
              <input
                id={`utm-${field.key}`}
                type="text"
                value={utms[field.key] || ""}
                onChange={(event) => updateUtm(field.key, event.target.value)}
                placeholder={field.placeholder}
              />
            </div>
          ))}
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>

          <button type="submit" className="btn" disabled={saving || !url.trim()}>
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
