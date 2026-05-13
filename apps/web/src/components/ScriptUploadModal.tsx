import { useCallback, useEffect, useReducer, useRef } from 'react';
import { Upload, X, FileText, AlertCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { useUploadScriptMutation } from '../hooks/useSessions';
import { PlayDetail } from '../types';

interface Props {
  onClose: () => void;
  onUploaded: (scriptId: string) => void;
}

type State = {
  file: File | null;
  title: string;
  preview: string;
  dragOver: boolean;
  validationError: string;
};

type Action =
  | { type: 'accept_file'; file: File; title: string }
  | { type: 'set_preview'; preview: string }
  | { type: 'set_title'; title: string }
  | { type: 'set_drag_over'; over: boolean }
  | { type: 'set_error'; message: string };

const initial: State = { file: null, title: '', preview: '', dragOver: false, validationError: '' };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'accept_file':
      return { ...state, file: action.file, title: action.title, preview: '', validationError: '' };
    case 'set_preview':
      return { ...state, preview: action.preview };
    case 'set_title':
      return { ...state, title: action.title };
    case 'set_drag_over':
      return { ...state, dragOver: action.over };
    case 'set_error':
      return { ...state, validationError: action.message };
  }
}

export function ScriptUploadModal({ onClose, onUploaded }: Props) {
  const [state, dispatch] = useReducer(reducer, initial);
  const { file, title, preview, dragOver, validationError } = state;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadScriptMutation();

  function acceptFile(f: File) {
    if (!f.name.endsWith('.md') && f.type !== 'text/markdown') {
      dispatch({ type: 'set_error', message: 'Only .md (Markdown) files are supported.' });
      return;
    }
    if (f.size > 1_000_000) {
      dispatch({ type: 'set_error', message: 'File is too large. Maximum size is 1 MB.' });
      return;
    }
    dispatch({ type: 'accept_file', file: f, title: f.name.replace(/\.md$/i, '') });
    const reader = new FileReader();
    reader.onload = (e) => dispatch({ type: 'set_preview', preview: (e.target?.result as string) ?? '' });
    reader.readAsText(f);
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dispatch({ type: 'set_drag_over', over: false });
    const f = e.dataTransfer.files?.[0];
    if (f) acceptFile(f);
  }, []);

  function handleSubmit() {
    if (!file || !title.trim()) return;
    upload.mutate({ file, title: title.trim() }, { onSuccess: (data: PlayDetail) => onUploaded(data.id) });
  }

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
            onDragOver={(e) => { e.preventDefault(); dispatch({ type: 'set_drag_over', over: true }); }}
            onDragLeave={() => dispatch({ type: 'set_drag_over', over: false })}
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
              onChange={(e) => { const f = e.target.files?.[0]; if (f) acceptFile(f); }}
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

          {file && (
            <div>
              <label className="mb-1.5 block text-sm text-muted-foreground">Title</label>
              <Input
                value={title}
                onChange={(e) => dispatch({ type: 'set_title', title: e.target.value })}
                placeholder="Script title"
              />
            </div>
          )}

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
          <Button onClick={handleSubmit} disabled={!file || !title.trim() || upload.isPending}>
            {upload.isPending ? 'Uploading…' : 'Upload Script'}
          </Button>
        </div>
      </div>
    </div>
  );
}
