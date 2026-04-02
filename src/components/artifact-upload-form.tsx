"use client";

import { useState } from "react";
import type { RunArtifact } from "@/features/runs/run.types";
import { artifactKindMeta } from "@/lib/presenter";

export function ArtifactUploadForm({ runId, onUploaded }: { runId: string; onUploaded?: (artifact: RunArtifact) => void }) {
  const [kind, setKind] = useState<RunArtifact["kind"]>("upload");
  const [label, setLabel] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setNotice("请先选择文件");
      return;
    }
    setSubmitting(true);
    setNotice(null);
    try {
      const form = new FormData();
      form.append("kind", kind);
      form.append("label", label || file.name);
      form.append("file", file);
      const response = await fetch(`/api/runs/${runId}/artifacts`, { method: "POST", body: form });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error?.message ?? "Upload failed");
      onUploaded?.(json.data as RunArtifact);
      setLabel("");
      setFile(null);
      setNotice("证据文件已上传");
      (event.currentTarget as HTMLFormElement).reset();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "上传失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="section-card p-5">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="section-kicker">Attach evidence</div>
          <div className="mt-2 text-xl font-bold text-slate-950">上传证据包 / 附件</div>
          <div className="mt-1 text-sm leading-6 text-slate-500">把截图、日志、trace、结果文件都归到同一个 run 下，后续回放和追责会轻松很多。</div>
        </div>
        <span className={`badge ${artifactKindMeta[kind].badgeClass}`}>{artifactKindMeta[kind].label}</span>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <label className="block text-sm font-medium text-slate-700">
          类型
          <select value={kind} onChange={(e) => setKind(e.target.value as RunArtifact["kind"])} className="input-shell">
            {(Object.keys(artifactKindMeta) as RunArtifact["kind"][]).map((value) => (
              <option key={value} value={value}>{artifactKindMeta[value].label}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700 md:col-span-2">
          标签
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="例如：运行前截图 / DOM trace / 日志包" className="input-shell" />
        </label>
      </div>

      <label className="mt-4 block text-sm font-medium text-slate-700">
        文件
        <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-2 block w-full rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-600" />
      </label>

      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="text-sm leading-6 text-slate-500">建议上传：关键截图、DOM trace、原始日志、最终输出、replay 包。</div>
        <button disabled={submitting} className="rounded-2xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
          {submitting ? "上传中..." : "上传 artifact"}
        </button>
      </div>

      {notice ? <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">{notice}</div> : null}
    </form>
  );
}
