import { terms } from "../../../config/content";
import { Modal } from "../../../shared/components/Modal";

type TermsModalProps = {
  open: boolean;
  onClose: () => void;
  onAccept?: () => void;
};

export function TermsModal({
  open,
  onClose,
  onAccept,
}: TermsModalProps): JSX.Element {
  return (
    <Modal
      open={open}
      title={terms.title}
      onClose={onClose}
      footer={
        onAccept ? (
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              onAccept();
              onClose();
            }}
          >
            Я согласен
          </button>
        ) : (
          <button type="button" className="secondary-button wide" onClick={onClose}>
            Закрыть
          </button>
        )
      }
    >
      <div className="terms-text">
        <p className="muted small">Редакция: {terms.version}</p>
        {terms.draftNotice ? <p className="notice">{terms.draftNotice}</p> : null}
        {terms.sections.map((section) => (
          <section key={section.title}>
            <h3>{section.title}</h3>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </section>
        ))}
      </div>
    </Modal>
  );
}
