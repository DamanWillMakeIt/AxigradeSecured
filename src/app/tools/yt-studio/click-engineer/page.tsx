"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Upload, Sparkles, X, Image as ImageIcon, AlertCircle } from "lucide-react";

const containerVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: { staggerChildren: 0.12, delayChildren: 0.1 },
  },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 30, scale: 0.96 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring", stiffness: 120, damping: 20 },
  },
};

type GenerationResult = {
  cloudinaryUrl: string;
  thumbnailUrl: string | null;
  videoTitle: string;
  summary?: string;
};

export default function ClickEngineerPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [videoTitle, setVideoTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [prompt, setPrompt] = useState("");

  // Axigrade key state
  const [axigKey, setAxigKey] = useState("");
  const [axigKeyVisible, setAxigKeyVisible] = useState(false);
  const [axigCredits, setAxigCredits] = useState<number | null>(null);
  const [axigCallCount, setAxigCallCount] = useState<number | null>(null);
  const [axigKeyLoading, setAxigKeyLoading] = useState(true);
  const [axigKeyGenerating, setAxigKeyGenerating] = useState(false);
  const [axigKeyError, setAxigKeyError] = useState<string | null>(null);

  // Load Axigrade key + credits on mount
  useEffect(() => {
    fetch("/api/click-engineer-key")
      .then(r => r.json())
      .then(d => {
        if (d.api_key) setAxigKey(d.api_key);
        if (d.credits !== null && d.credits !== undefined) setAxigCredits(d.credits);
        if (d.callCount !== null && d.callCount !== undefined) setAxigCallCount(d.callCount);
      })
      .catch(() => {})
      .finally(() => setAxigKeyLoading(false));
  }, []);

  const handleGenerateAxigKey = async () => {
    setAxigKeyGenerating(true);
    setAxigKeyError(null);
    try {
      const res = await fetch("/api/click-engineer-key", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Key generation failed");
      setAxigKey(data.api_key);
      if (data.credits !== null && data.credits !== undefined) setAxigCredits(data.credits);
      if (data.callCount !== null && data.callCount !== undefined) setAxigCallCount(data.callCount);
    } catch (e: unknown) {
      setAxigKeyError(e instanceof Error ? e.message : "Key generation failed");
    } finally {
      setAxigKeyGenerating(false);
    }
  };

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerationResult | null>(null);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith("image/")) {
      setReferenceImage(file);
      const reader = new FileReader();
      reader.onload = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
      setError(null);
    } else {
      setError("Please select a valid image file");
    }
  };

  const removeImage = () => {
    setReferenceImage(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleGenerate = async () => {
    if (!referenceImage) {
      setError("Please upload a reference image");
      return;
    }
    if (!videoTitle.trim()) {
      setError("Please enter a video title");
      return;
    }
    if (!prompt.trim()) {
      setError("Please describe how you want the thumbnail");
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("image", referenceImage);
      formData.append("videoTitle", videoTitle);
      formData.append("summary", summary);
      formData.append("prompt", prompt);

      const response = await fetch("/api/thumbnail-generate", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate thumbnail");
      }

      setResult(data);
    } catch (err: any) {
      setError(err.message || "An error occurred during generation");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleReset = () => {
    setReferenceImage(null);
    setImagePreview(null);
    setVideoTitle("");
    setSummary("");
    setPrompt("");
    setResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="relative min-h-[100dvh] w-full text-slate-200 font-sans overflow-hidden p-6 md:p-12">
      {/* Background */}
      <div className="fixed inset-0 -z-10 bg-slate-950">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.16),transparent_55%),radial-gradient(circle_at_bottom_left,_rgba(248,113,113,0.2),transparent_55%)]" />
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="relative z-10 max-w-6xl mx-auto flex flex-col gap-8"
      >
        {/* Header */}
        <div className="flex items-center gap-6">
          <motion.button
            onClick={() => router.back()}
            whileHover={{ scale: 1.08, x: -4 }}
            whileTap={{ scale: 0.9 }}
            className="flex items-center justify-center w-11 h-11 rounded-full bg-white/5 border border-amber-300/40 backdrop-blur-md text-amber-200 hover:bg-amber-500/10"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2.5}
              stroke="currentColor"
              className="w-5 h-5"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </motion.button>

          <div>
            <motion.h1
              variants={cardVariants}
              className="text-3xl md:text-5xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-orange-500 to-rose-400"
            >
              THE CLICK ENGINEER
            </motion.h1>
            <motion.p
              variants={cardVariants}
              className="mt-2 max-w-xl text-sm md:text-base text-slate-300"
            >
              Generate compelling YouTube thumbnail concepts with AI
            </motion.p>
          </div>
        </div>

        {/* ── Axigrade API Key Panel ── */}
        <motion.div
          variants={cardVariants}
          className={`rounded-2xl border backdrop-blur-2xl p-5 md:p-6 ${!axigKey ? "border-white/10 bg-slate-900/60" : axigCredits === 0 ? "border-rose-500/25 bg-rose-950/10" : axigCredits !== null && axigCredits <= 10 ? "border-amber-500/25 bg-amber-950/10" : "border-amber-500/20 bg-amber-950/10"}`}
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-amber-400 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-amber-400">
                  <path fillRule="evenodd" d="M8 7a5 5 0 1 1 3.61 4.804l-1.903 1.903A1 1 0 0 1 9 14H8v1a1 1 0 0 1-1 1H6v1a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-2a1 1 0 0 1 .293-.707L7.196 9.39A5.002 5.002 0 0 1 8 7Zm5-1a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z" clipRule="evenodd" />
                </svg>
                Axigrade API Key
              </p>
              {!axigKey && !axigKeyLoading && (
                <button onClick={handleGenerateAxigKey} disabled={axigKeyGenerating}
                  className="px-4 py-2 rounded-xl text-sm font-bold bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                  {axigKeyGenerating ? (
                    <><svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Generating...</>
                  ) : "Generate My Key"}
                </button>
              )}
            </div>

            {axigKeyLoading ? (
              <p className="text-sm text-slate-500">Loading...</p>
            ) : axigKey ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 p-3 rounded-xl bg-white/5 border border-white/10">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-amber-400 flex-shrink-0">
                    <path fillRule="evenodd" d="M8 7a5 5 0 1 1 3.61 4.804l-1.903 1.903A1 1 0 0 1 9 14H8v1a1 1 0 0 1-1 1H6v1a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-2a1 1 0 0 1 .293-.707L7.196 9.39A5.002 5.002 0 0 1 8 7Zm5-1a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z" clipRule="evenodd" />
                  </svg>
                  <span className="font-mono text-xs text-amber-300 flex-1 truncate">{axigKeyVisible ? axigKey : "•".repeat(32)}</span>
                  <button onClick={() => setAxigKeyVisible(v => !v)}
                    className="flex-shrink-0 text-[10px] uppercase tracking-widest text-slate-400 hover:text-amber-300 transition-colors px-2 py-1 rounded-lg bg-white/5 hover:bg-amber-500/10 border border-white/10">
                    {axigKeyVisible ? "Hide" : "Show"}
                  </button>
                  <button onClick={() => navigator.clipboard.writeText(axigKey)}
                    className="flex-shrink-0 text-[10px] uppercase tracking-widest text-slate-400 hover:text-amber-300 transition-colors px-2 py-1 rounded-lg bg-white/5 hover:bg-amber-500/10 border border-white/10">
                    Copy
                  </button>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold border ${
                    axigCredits === null ? "text-slate-400 border-slate-500/30 bg-slate-500/10"
                    : axigCredits > 10 ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                    : axigCredits > 0 ? "text-amber-400 border-amber-500/30 bg-amber-500/10"
                    : "text-rose-400 border-rose-500/30 bg-rose-500/10"
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${axigCredits === null ? "bg-slate-400" : axigCredits > 10 ? "bg-emerald-400" : axigCredits !== null && axigCredits > 0 ? "bg-amber-400 animate-pulse" : "bg-rose-400"}`} />
                    {axigCredits ?? "—"} credit{axigCredits !== 1 ? "s" : ""} remaining
                  </span>
                  {axigCallCount !== null && (
                    <span className="text-xs text-slate-500">{axigCallCount} call{axigCallCount !== 1 ? "s" : ""} made</span>
                  )}
                  {axigCredits === 0 && (
                    <p className="w-full text-sm text-rose-400">No credits remaining. Please contact support to top up.</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400">No API key yet. Click <span className="text-amber-400 font-semibold">Generate My Key</span> above to get started.</p>
            )}
            {axigKeyError && <p className="text-sm text-rose-400 font-mono">{axigKeyError}</p>}
          </div>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Input Panel */}
          <motion.div
            variants={cardVariants}
            className="rounded-3xl border border-white/10 bg-slate-900/60 px-6 py-8 backdrop-blur-2xl"
          >
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              Thumbnail Generator
            </h2>

            <div className="space-y-5">
              {/* Reference Image Upload */}
              <div>
                <label className="block text-xs uppercase tracking-widest text-amber-400/80 mb-2">
                  Reference Image (Max 1)
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  className="hidden"
                />
                {!imagePreview ? (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full aspect-video rounded-xl border-2 border-dashed border-white/20 bg-white/5 hover:bg-white/10 hover:border-amber-400/50 transition-all flex flex-col items-center justify-center gap-2 text-slate-400 hover:text-amber-400"
                  >
                    <Upload className="w-8 h-8" />
                    <span className="text-sm font-semibold">Click to upload</span>
                    <span className="text-xs">PNG, JPG up to 10MB</span>
                  </button>
                ) : (
                  <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-white/10">
                    <Image
                      src={imagePreview!}
                      alt="Reference"
                      fill
                      unoptimized
                      className="object-cover"
                    />
                    <button
                      onClick={removeImage}
                      className="absolute top-2 right-2 w-8 h-8 rounded-full bg-rose-500 hover:bg-rose-600 flex items-center justify-center transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Video Title */}
              <div>
                <label className="block text-xs uppercase tracking-widest text-amber-400/80 mb-2">
                  Video Title *
                </label>
                <input
                  type="text"
                  value={videoTitle}
                  onChange={(e) => setVideoTitle(e.target.value)}
                  placeholder="Enter your video title"
                  className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                />
              </div>

              {/* Summary (Optional) */}
              <div>
                <label className="block text-xs uppercase tracking-widest text-slate-400 mb-2">
                  Short Summary (Optional)
                </label>
                <textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="Brief description of your video..."
                  rows={3}
                  className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-amber-400 resize-none"
                />
              </div>

              {/* Generation Prompt */}
              <div>
                <label className="block text-xs uppercase tracking-widest text-amber-400/80 mb-2">
                  How do you want the thumbnail? *
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g., Make it bright and energetic with bold text overlay, focus on the person's face..."
                  rows={4}
                  className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-amber-400 resize-none"
                />
              </div>

              {/* Error Display */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center gap-2 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30"
                  >
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <p className="text-sm text-rose-300">{error}</p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleReset}
                  className="flex-1 py-3 rounded-xl border border-white/10 text-sm font-semibold text-slate-400 hover:bg-white/5 transition-colors"
                >
                  Reset
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-sm font-bold text-slate-950 disabled:opacity-40 hover:opacity-90 transition-opacity disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isGenerating ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Generate
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>

          {/* Result Panel */}
          <motion.div
            variants={cardVariants}
            className="rounded-3xl border border-white/10 bg-slate-900/60 px-6 py-8 backdrop-blur-2xl"
          >
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-amber-400" />
              Result
            </h2>

            {!result ? (
              <div className="flex flex-col items-center justify-center h-[500px] text-center text-slate-500">
                <ImageIcon className="w-16 h-16 mb-4 opacity-20" />
                <p className="text-sm">Your thumbnail concept will appear here</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Generated Thumbnail */}
                <div>
                  <p className="text-xs uppercase tracking-widest text-amber-400 mb-2">Generated Thumbnail</p>
                  {result.thumbnailUrl ? (
                    <>
                      <div className="rounded-xl overflow-hidden border border-white/10 aspect-video relative">
                        <Image
                          src={result.thumbnailUrl}
                          alt="Generated thumbnail"
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                      <a
                        href={result.thumbnailUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block mt-2 text-xs text-amber-400 hover:text-amber-300 underline"
                      >
                        Download / Open Full Size
                      </a>
                    </>
                  ) : (
                    <div className="rounded-xl border border-white/10 bg-slate-800/50 aspect-video flex items-center justify-center text-slate-500 text-sm">
                      No thumbnail returned
                    </div>
                  )}
                </div>

                {/* Video Info */}
                <div>
                  <p className="text-xs uppercase tracking-widest text-slate-400 mb-2">Video Title</p>
                  <p className="text-base font-semibold">{result.videoTitle}</p>
                </div>

                {result.summary && (
                  <div>
                    <p className="text-xs uppercase tracking-widest text-slate-400 mb-2">Summary</p>
                    <p className="text-sm text-slate-300">{result.summary}</p>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}