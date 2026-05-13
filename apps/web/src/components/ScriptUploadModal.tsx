import { useCallback, useEffect, useRef, useState } from 'react';
import { Upload, X, FileText, AlertCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { useUploadScriptMutation } from '../hooks/useSessions';

interface Props {
  onClose: () => void;
  onUploaded: (scriptId: string) => void;
}

export function ScriptUploadModal({ onClose, onUploaded }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [preview, setPreview] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [validationError, setValidationError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadScriptMutation();

  function acceptFile(f: File) {
    if (!f.name.endsWith('.md') && f.type !== 'text/markdown') {
      setValidationError('Only .md (Markdown) files are supported.');
      return;
    }
    if (f.size > 1_000_000) {
      setValidationError('File is too large. Maximum size is 1 MB.');
      return;
    }
    setValidationError('');
    setFile(f);
    setTitle(f.name.replace(/\.md$/i, ''));
    const reader = new FileReader();
    reader.onload = (e) => setPreview((e.target?.result as string) ?? '');
    reader.readAsText(f);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) acceptFile(f);
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) acceptFile(f);
  }, []);

  function handleSubmit() {
    if (!file || !title.trim()) return;
    upload.mutate(
      { file, title: title.trim() },
      {
        onSuccess: (data) => onUploaded(data.id),
      },
    );
  }

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg rounded-xl border border-border bg-[#1a1118] shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4 shrink-0">
          <div className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-secondary" />
            <h2 className="text-base font-semibold">Upload Script</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4 p-5 overflow-y-auto flex-1">
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`cursor-pointer rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors ${
              dragOver
                ? 'border-secondary bg-secondary/10'
                : file
                ? 'border-green-600/50 bg-green-900/10'
                : 'border-border hover:border-secondary/50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,text/markdown"
              className="hidden"
              onChange={handleFileChange}
            />
            {file ? (
              <div className="flex items-center justify-center gap-2 text-sm text-green-400">
                <FileText className="h-5 w-5" />
                <span>{file.name}</span>
                <span className="text-muted-foreground">({(file.size / 1024).toFixed(1)} KB)</span>
              </div>
            ) : (
              <div className="space-y-1">
                <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium">Drop a .md file here or click to browse</p>
                <p className="text-xs text-muted-foreground">Markdown format · max 1 MB</p>
              </div>
            )}
          </div>

          {validationError && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {validationError}
            </div>
          )}

          {/* Title input */}
          {file && (
            <div>
              <label className="mb-1.5 block text-sm text-muted-foreground">Title</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Script title"
              />
            </div>
          )}

          {/* Preview */}
          {preview && (
            <div>
              <p className="mb-1.5 text-sm text-muted-foreground">Preview</p>
              <pre className="max-h-48 overflow-y-auto rounded-md bg-black/40 p-3 text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap font-mono">
                {preview.slice(0, 3000)}{preview.length > 3000 ? '\n\n… (truncated)' : ''}
              </pre>
            </div>
          )}

          {upload.isError && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {upload.error instanceof Error ? upload.error.message : 'Upload failed.'}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4 shrink-0">
          <Button variant="outline" onClick={onClose} disabled={upload.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!file || !title.trim() || upload.isPending}
          >
            {upload.isPending ? 'Uploading…' : 'Upload Script'}
          </Button>
        </div>
      </div>
    </div>
  );
}
