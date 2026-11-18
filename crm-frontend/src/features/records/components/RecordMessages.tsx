type RecordMessagesProps = {
  error: string;
  notice: string;
};

export function RecordMessages({
  error,
  notice,
}: RecordMessagesProps): JSX.Element | null {
  if (!error && !notice) {
    return null;
  }

  return <div className={error ? "alert" : "notice"}>{error || notice}</div>;
}
