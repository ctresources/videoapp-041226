"use client";

import { cn } from "@/lib/utils/cn";
import { Upload, FileAudio, X, CheckCircle } from "lucide-react";
import { useCallback, useRef, useState } from "react";

const ACCEPTED = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/webm", "audio/mp4", "audio/m4a", "audio/ogg"];
const MAX_MB = 50;

interface VoiceUploaderProps {
  onFileSelected: (file: File) => void;
}

export function VoiceUploader({ onFileSelected }: VoiceUploaderProps) {
  const [dragging, setDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function validate(file: File): string | null {
    if (!ACCEPTED.some((t) => file.type === t || file.name.endsWith(t.split("/")[1]))) {
      return "Unsupported format. Please upload MP3, WAV, M4A, or WebM.";
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      return `File too large. Max ${MAX_MB}MB.`;
    }
    return null;
  }

  function handleFile(file: File) {
    const err = validate(file);
    if (err) { setError(err); return; }
    setError(null);
    setSelectedFile(file);
    onFileSelected(file);
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, []); // eslint-disable-line

  function handleClear() {
    setSelectedFile(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="w-full">
      {!selectedFile ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all",
            dragging
              ? "border-primary-500 bg-primary-50"
              : "border-slate-200 hover:border-primary-400 hover:bg-slate-50 bg-white"
          )}
        >
          <div className="w-14 h-14 bg-primary-50 rounded-2xl flex items-center justify-center">
            <Upload className="w-7 h-7 text-primary-500" />
          </div>
          <div className="text-center">
            <p className="font-medium text-brand-text">Drop your audio file here</p>
            <p className="text-sm text-slate-400 mt-1">or click to browse</p>
            <p className="text-xs text-slate-300 mt-2">MP3, WAV, M4A, WebM · Max {MAX_MB}MB</p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED.join(",")}
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
        </div>
      ) : (
        <div className="border border-slate-200 rounded-2xl p-4 flex items-center gap-4 bg-white">
          <div className="w-12 h-12 bg-accent-500/10 rounded-xl flex items-center justify-center shrink-0">
            <FileAudio className="w-6 h-6 text-accent-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-brand-text truncate">{selectedFile.name}</p>
            <p className="text-xs text-slate-400">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
          </div>
          <CheckCircle className="w-5 h-5 text-accent-500 shrink-0" />
          <button onClick={handleClear} className="p-1 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-500 mt-2 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
