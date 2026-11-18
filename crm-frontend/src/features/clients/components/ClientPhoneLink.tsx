export function ClientPhoneLink({ phone }: { phone: string | null }): JSX.Element {
  const text = phone?.trim();
  // The API returns +7. Older profiles may use the domestic 8 prefix or omit it.
  const compact = text?.replace(/[\s().-]/g, "");
  const subscriber = compact?.match(/^(?:\+7|7|8)?(7\d{9})$/)?.[1];
  if (!subscriber) {
    return <>{text || "—"}</>;
  }

  const digits = `7${subscriber}`;
  return (
    <a
      className="client-phone-link"
      href={`https://wa.me/${digits}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Написать в WhatsApp на +${digits}`}
      onClick={(event) => event.stopPropagation()}
    >
      +{digits} <small>WhatsApp</small>
    </a>
  );
}
