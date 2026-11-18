type ExpenseMessagesProps = {
  error: string;
  notice: string;
};

export function ExpenseMessages({
  error,
  notice,
}: ExpenseMessagesProps): JSX.Element | null {
  if (!error && !notice) {
    return null;
  }

  return <div className={error ? "alert" : "notice"}>{error || notice}</div>;
}
