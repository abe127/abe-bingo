import { useEffect, useId, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

/** 相手の QR（参加URL の #/meet/1234、または4けたの数字）を読み取る */
export function Scanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const id = "scanner-" + useId().replace(/:/g, "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const qr = new Html5Qrcode(id, { verbose: false });
    let done = false;
    const started = qr
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (text) => {
          const code = text.match(/(?:meet\/)?(\d{4})\s*$/)?.[1];
          if (code && !done) {
            done = true;
            onCode(code);
          }
        },
        () => {},
      )
      .catch(() => setError("カメラを使えませんでした。ブラウザの設定でカメラを許可するか、コードを入力してください。"));
    return () => {
      started
        .then(() => {
          if (qr.isScanning) qr.stop().catch(() => {});
        })
        .catch(() => {});
    };
  }, [id, onCode]);

  return (
    <div className="scanner">
      <div id={id} className="scanner-view" />
      {error && <p className="err">{error}</p>}
      <button className="btn ghost" onClick={onClose}>
        閉じる
      </button>
    </div>
  );
}
