import { QRCodeSVG } from 'qrcode.react';

interface Props {
  joinCode: string;
}

export function QRCodeDisplay({ joinCode }: Props) {
  const url = `${window.location.origin}/join/${joinCode}`;
  return (
    <div style={{ textAlign: 'center', padding: '16px' }}>
      <QRCodeSVG value={url} size={200} />
      <p style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 20, letterSpacing: 4 }}>
        {joinCode}
      </p>
      <p style={{ fontSize: 12, color: '#666' }}>{url}</p>
    </div>
  );
}
