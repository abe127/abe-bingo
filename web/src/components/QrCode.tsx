import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** 文字列を QR コード画像にする */
export function QrCode({ value, size = 160, label }: { value: string; size?: number; label: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(value, { width: size * 2, margin: 1, errorCorrectionLevel: "M" })
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setSrc(null));
    return () => {
      alive = false;
    };
  }, [value, size]);
  return src ? (
    <img className="qr" src={src} width={size} height={size} alt={label} />
  ) : (
    <div className="qr" style={{ width: size, height: size }} aria-hidden="true" />
  );
}
