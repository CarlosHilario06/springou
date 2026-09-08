import Modal from "./Modal";

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = "Excluir",
  onConfirm,
  onCancel,
  busy,
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="muted" style={{ margin: 0 }}>
        {message}
      </p>

      <div className="modal-footer">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onCancel}
          disabled={busy}
        >
          Cancelar
        </button>

        <button
          type="button"
          className="btn btn-danger"
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? "Excluindo..." : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
