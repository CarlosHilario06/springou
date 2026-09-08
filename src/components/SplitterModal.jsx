import { useState } from "react";
import Modal from "./Modal";

export default function SplitterModal({ splitter, onSave, onClose }) {
  const [category, setCategory] = useState(splitter?.category || "");
  const [location, setLocation] = useState(splitter?.location || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSaving(true);

    try {
      await onSave({
        category: category.trim(),
        location: location.trim(),
      });
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={splitter ? "Editar splitter" : "Novo splitter"}
      subtitle="Um splitter agrupa os links que disputam o mesmo tráfego."
      onClose={onClose}
    >
      <form onSubmit={handleSubmit}>
        {error && <div className="alert alert-error">{error}</div>}

        <div className="field">
          <label htmlFor="splitter-category">Categoria</label>
          <input
            id="splitter-category"
            type="text"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            placeholder="Ex.: Emagrecimento"
            autoFocus
            required
          />
        </div>

        <div className="field">
          <label htmlFor="splitter-location">Localização (opcional)</label>
          <input
            id="splitter-location"
            type="text"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            placeholder="Ex.: Brasil"
          />
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
            disabled={saving || !category.trim()}
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
