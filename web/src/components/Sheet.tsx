import { useEffect, type ReactNode } from "react";

/** 画面下からせり上がるシート。背景をタップするか Esc で閉じる */
export function Sheet({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true">
        {children}
      </div>
    </div>
  );
}

export function Who({ label, name }: { label: string; name: string }) {
  return (
    <div className="who">
      <div className="avatar" aria-hidden="true">
        {[...name][0] ?? "?"}
      </div>
      <div>
        <div className="label">{label}</div>
        <b>{name}</b>
      </div>
    </div>
  );
}
