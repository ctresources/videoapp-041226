"use client";

import { cn } from "@/lib/utils/cn";
import { Upload, FileAudio, X, CheckCircle } from "lucide-react";
import { useCallback, useRef, useState } from "react";

const ACCEPTED_AUDIO = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/webm", "audio/mp4", "audio/m4a", "audio/ogg"];
/**
 * Video is accepted here too, and only its speech is used.
 *
 * A phone films rather than voice-memos by default, so the recording someone
 * already has of themselves talking through a topic is usually an .mp4 — and
 * this slot used to reject it for being the wrong container while the words
 * inside it were exactly what was wanted. The footage is not kept: this is the
 * entry point that mines a file for words, not the one that brands it.
 */
const ACCEPTED_VIDEO = ["video/mp4", "video/webm", "video/quicktime", "video/x-matroska"];
const ACCEPTED = [...ACCEPTED_AUDIO, ...ACCEPTED_VIDEO];

/** Audio goes up as it is, so it stays bound by what a request body will
 *  carry. A video never does — its speech is decoded out first, and two
 *  minutes of that is a few megabytes whatever the video weighed. */
const MAX_AUDIO_MB = 50;
const MAX_VIDEO_MB = 300;

export function isVideoFile(file: File): boolean {
  return file.type.startsWith("video/") || /\.(mp4|mov|webm|mkv|m4v)$/i.test(file.name);
}

interface VoiceUploaderProps {
  onFileSelected: (file: File) => void;
}

export function VoiceUploader({ onFileSelected }: VoiceUploaderProps) {
  const [dragging, setDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function validate(file: File): string | null {
    const isVideo = isVideoFile(file);
    if (!isVideo && !ACCEPTED.some((t) => file.type === t || file.name.endsWith(t.split("/")[1]))) {
      return "Unsupported format. Please upload MP3, WAV, M4A, WebM, MP4 or MOV.";
    }
    const cap = isVideo ? MAX_VIDEO_MB : MAX_AUDIO_MB;
    if (file.size > cap * 1024 * 1024) {
      return `That file is ${Math.round(file.size / 1024 / 1024)} MB. The limit is ${cap} MB for ${isVideo ? "video" : "audio"}.`;
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
            <p className="font-medium text-brand-text">Drop a recording of yourself talking</p>
            <p className="text-sm text-slate-400 mt-1">or click to browse</p>
            {/* Says what happens to the file, because the other upload on this
                page keeps the footage and this one throws it away. Someone who
                mixes those up loses a video they meant to publish. */}
            <p className="text-xs text-slate-400 mt-2">
              Audio or video — only the words are used, and the footage isn&apos;t kept
            </p>
            <p className="text-xs text-slate-300 mt-1">
              MP3, WAV, M4A, WebM up to {MAX_AUDIO_MB}MB · MP4, MOV up to {MAX_VIDEO_MB}MB
            </p>
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
