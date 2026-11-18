type ParcelMessagesProps = {
  error: string;
  notice: string;
};

export function ParcelMessages({
  error,
  notice,
}: ParcelMessagesProps): JSX.Element | null {
  if (!error && !notice) {
    return null;
  }

  return <div className={error ? "alert" : "notice"}>{error || notice}</div>;
}
