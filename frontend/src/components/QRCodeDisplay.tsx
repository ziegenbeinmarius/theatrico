import { QRCodeSVG } from 'qrcode.react';

interface Props {
  joinCode: string;
  url?: string;
}

export function QRCodeDisplay({ joinCode, url = `${window.location.origin}/join/${joinCode}` }: Props) {
  return (
    <div className="text-center">
      <div className="inline-flex rounded-md bg-white p-3">
        <QRCodeSVG value={url} size={196} />
      </div>
      <p className="mt-3 font-mono text-2xl font-semibold tracking-[0.3em] text-secondary">{joinCode}</p>
      <p className="mt-2 break-all text-xs text-muted-foreground">{url}</p>
    </div>
  );
}
