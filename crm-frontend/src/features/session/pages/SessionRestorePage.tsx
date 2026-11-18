import { Loader2 } from "lucide-react";

export function SessionRestorePage(): JSX.Element {
  return (
    <div className="center-state">
      <Loader2 className="spin" size={28} />
      <div>
        <h1>Проверяем вход</h1>
        <p>Секунду: открываем админ-панель OYU Cargo.</p>
      </div>
    </div>
  );
}
