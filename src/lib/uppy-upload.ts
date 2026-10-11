import type { Api } from "@/lib/api";

export class UploadCancelled extends Error {
  constructor() {
    super("The upload was cancelled.");
    this.name = "UploadCancelled";
  }
}

export function declaredUpload(file: File): { name: string; size: number; mime: string } {
  return { name: file.name, size: file.size, mime: file.type || "application/octet-stream" };
}

type CompletedUpload = Awaited<ReturnType<Api["completeUpload"]>>;

/** Uploads files in the given order with Uppy. Transloadit's plugin sends the bytes over tus. */
export async function uploadFiles(
  api: Api,
  files: File[],
  options?: {
    signal?: AbortSignal;
    onProgress?: (update: { name: string; percentage: number }) => void;
  },
): Promise<CompletedUpload> {
  if (files.length === 0) throw new Error("Choose a file to upload.");
  if (options?.signal?.aborted) throw new UploadCancelled();
  const signed = await api.createAssembly(files.map(declaredUpload));
  if (options?.signal?.aborted) throw new UploadCancelled();
  const [{ default: Uppy }, { default: Transloadit }] = await Promise.all([import("@uppy/core"), import("@uppy/transloadit")]);
  const uppy = new Uppy({ restrictions: { maxNumberOfFiles: files.length } }).use(Transloadit, {
    waitForEncoding: true,
    assemblyOptions: {
      params: signed.params,
      signature: signed.signature,
    },
  });
  let assemblyId = "";
  let assemblyError = "";
  const remember = (assembly: unknown) => {
    const id = assemblyIdFromPayload(assembly);
    if (id) assemblyId = id;
  };
  uppy.on("transloadit:assembly-created", remember);
  uppy.on("transloadit:complete", remember);
  uppy.on("transloadit:assembly-error", (_assembly: unknown, error: unknown) => {
    const message = error instanceof Error ? error.message.trim() : "";
    if (message) assemblyError = message;
  });
  uppy.on("upload-progress", (file, progress) => {
    if (!file || typeof progress.percentage !== "number") return;
    options?.onProgress?.({ name: file.name ?? "", percentage: progress.percentage });
  });
  const cancel = () => {
    uppy.cancelAll();
  };
  options?.signal?.addEventListener("abort", cancel);
  try {
    for (const file of files) {
      uppy.addFile({ name: file.name, type: file.type, data: file });
    }
    const result = await uppy.upload();
    if (options?.signal?.aborted || result == null) throw new UploadCancelled();
    const id = assemblyIdFromUpload(result, assemblyId);
    if (!id) {
      const reason = uploadFailure(result);
      throw new Error(reason ?? "Transloadit did not return an Assembly id.");
    }
    const completed = await api.completeUpload(signed.uploadId, id);
    if (completed.status === "completed") return { ...completed, assets: orderAssets(files, completed.assets) };
    if (completed.status === "canceled") throw new UploadCancelled();
    if (completed.status === "pending") throw new Error("The upload is still processing. Try again.");
    throw new Error(assemblyError || uploadFailure(result) || "The upload could not be processed. Try again.");
  } finally {
    options?.signal?.removeEventListener("abort", cancel);
    uppy.destroy();
  }
}

export async function uploadFile(api: Api, file: File): Promise<{ uploadId: string; assemblyId: string }> {
  const completed = await uploadFiles(api, [file]);
  return { uploadId: completed.uploadId, assemblyId: "" };
}

export function assemblyIdFromPayload(assembly: unknown): string {
  if (!assembly || typeof assembly !== "object") return "";
  const record = assembly as { assembly_id?: unknown; status?: { assembly_id?: unknown } };
  const raw = typeof record.assembly_id === "string" ? record.assembly_id : record.status?.assembly_id;
  return normalizeAssemblyId(raw);
}

export function assemblyIdFromUpload(result: {
  transloadit?: Array<{ assembly_id?: string } | null> | null;
  successful?: Array<{ transloadit?: { assembly?: string } | null } | null> | null;
} | null | undefined, fromEvent: string): string {
  const candidates = [
    fromEvent,
    ...(result?.transloadit ?? []).map((item) => item?.assembly_id ?? ""),
    ...(result?.successful ?? []).map((file) => file?.transloadit?.assembly ?? ""),
  ];
  for (const candidate of candidates) {
    const id = normalizeAssemblyId(candidate);
    if (id) return id;
  }
  return "";
}

function normalizeAssemblyId(value: unknown): string {
  if (typeof value !== "string") return "";
  const id = value.trim().toLowerCase();
  return /^[a-f0-9]{32}$/.test(id) ? id : "";
}

function uploadFailure(result: { failed?: Array<{ error?: string | null } | null> | null }): string | null {
  const message = (result.failed ?? [])
    .map((file) => file?.error?.trim() ?? "")
    .find((error) => error.length > 0);
  return message ?? null;
}

export function orderAssets<T extends { originalName: string | null }>(files: File[], assets: T[]): T[] {
  const remaining = [...assets];
  const ordered: T[] = [];
  for (const file of files) {
    const index = remaining.findIndex((asset) => asset.originalName === file.name);
    if (index < 0) continue;
    const asset = remaining[index];
    if (!asset) continue;
    remaining.splice(index, 1);
    ordered.push(asset);
  }
  return [...ordered, ...remaining];
}
