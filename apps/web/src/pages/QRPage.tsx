import { useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Clapperboard } from 'lucide-react';

export function QRPage() {
  const { code } = useParams<{ code: string }>();
  if (!code) return null;
  const url = `${window.location.origin}/join/${code}`;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(143,29,44,0.25),transparent_32rem),linear-gradient(135deg,#130f13_0%,#211318_45%,#101716_100%)] p-8 gap-8">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
          <Clapperboard className="h-5 w-5" aria-hidden="true" />
        </div>
        <span className="text-2xl font-semibold tracking-normal">Theatrico</span>
      </div>
      <div className="flex flex-col items-center gap-5">
        <div className="inline-flex rounded-2xl bg-white p-6 shadow-2xl">
          <QRCodeSVG value={url} size={340} />
        </div>
        <p className="font-mono text-6xl font-semibold tracking-[0.45em] text-secondary">{code}</p>
        <p className="text-sm text-muted-foreground break-all">{url}</p>
        <p className="text-base text-muted-foreground">Scan to follow along</p>
      </div>
    </main>
  );
}
