import { useState } from "react";
import Modal from "./Modal";

export default function RouteModal({ route, tabs, currentTab, onSave, onClose }) {
  const [domain, setDomain] = useState(route?.domain || "");
  const [slug, setSlug] = useState(route?.slug || "");
  const [tab, setTab] = useState(route?.tab || currentTab || "1");
  const [pixelId, setPixelId] = useState(route?.pixelId || "");
  const [loaderTitle, setLoaderTitle] = useState(route?.loaderTitle || "");
  const [loaderSubtitle, setLoaderSubtitle] = useState(
    route?.loaderSubtitle || ""
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSaving(true);

    try {
      await onSave({
        domain: domain.trim(),
        slug: slug.trim(),
        tab,
        pixelId: pixelId.trim(),
        loaderTitle: loaderTitle.trim(),
        loaderSubtitle: loaderSubtitle.trim(),
      });
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSaving(false);
    }
  }

  const preview = `${domain.trim() || "seudominio.com"}/go/${
    slug.trim() || "slug"
  }`;

  return (
    <Modal
      title={route ? "Editar rota" : "Nova rota"}
      subtitle="Endereço público que sorteia um link da aba escolhida."
      onClose={onClose}
      wide
    >
      <form onSubmit={handleSubmit}>
        {error && <div className="alert alert-error">{error}</div>}

        <div className="field-row">
          <div className="field">
            <label htmlFor="route-domain">Domínio</label>
            <input
              id="route-domain"
              type="text"
              value={domain}
              onChange={(event) => setDomain(event.target.value)}
              placeholder="meusite.com.br"
              autoFocus
              required
            />
          </div>

          <div className="field">
            <label htmlFor="route-slug">Slug</label>
            <input
              id="route-slug"
              type="text"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              placeholder="oferta-01"
              required
            />
          </div>
        </div>

        <div className="alert alert-info mono">{preview}</div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="route-tab">Aba de destino</label>
            <select
              id="route-tab"
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

          <div className="field">
            <label htmlFor="route-pixel">Pixel do Facebook (opcional)</label>
            <input
              id="route-pixel"
              type="text"
              value={pixelId}
              onChange={(event) => setPixelId(event.target.value)}
              placeholder="Só números"
              inputMode="numeric"
            />
          </div>
        </div>

        <h3 className="modal-section-title">Página de carregamento</h3>

        <div className="field">
          <label htmlFor="route-loader-title">Título</label>
          <input
            id="route-loader-title"
            type="text"
            value={loaderTitle}
            onChange={(event) => setLoaderTitle(event.target.value)}
            placeholder="Só um instante..."
          />
        </div>

        <div className="field">
          <label htmlFor="route-loader-subtitle">Subtítulo</label>
          <input
            id="route-loader-subtitle"
            type="text"
            value={loaderSubtitle}
            onChange={(event) => setLoaderSubtitle(event.target.value)}
            placeholder="Estamos preparando seu conteúdo."
          />
          <span className="field-hint">
            Essa tela dá tempo do pixel disparar antes do visitante sair.
          </span>
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

          <button
            type="submit"
            className="btn"
            disabled={saving || !domain.trim() || !slug.trim()}
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
