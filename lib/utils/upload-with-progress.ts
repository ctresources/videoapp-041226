import { createClient } from "@/lib/supabase/client";

/**
 * A file straight from the browser to storage, reporting how far it has got.
 *
 * supabase-js's own upload gives no progress, so a 150 MB phone video sat on
 * a spinner with nothing to say it was moving (2026-10-21, the owner's
 * Digital Twin upload). This asks for a signed upload address the same way,
 * then sends the file with XMLHttpRequest, which does report progress. The
 * form body and headers are the ones supabase-js's uploadToSignedUrl sends.
 *
 * Never an overwrite: an upsert needs a read rule the "assets" bucket
 * deliberately doesn't have.
 */
export async function uploadWithProgress(
  bucket: string,
  path: string,
  file: File,
  onProgress: (fraction: number) => void,
): Promise<string> {
  const storage = createClient().storage.from(bucket);
  const { data, error } = await storage.createSignedUploadUrl(path);
  if (error || !data?.signedUrl) throw new Error(error?.message || "Couldn't start the upload.");

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", data.signedUrl);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("apikey", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "");
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) { onProgress(1); resolve(); return; }
      let message = "";
      try { message = JSON.parse(xhr.responseText)?.message ?? ""; } catch { /* not JSON */ }
      reject(new Error(
        /maximum allowed size|too large|payload/i.test(message)
          ? "That video is larger than storage allows. Try a shorter one."
          : message || "The upload didn't finish. Try again.",
      ));
    };
    xhr.onerror = () => reject(new Error("The upload stopped. Check your connection and try again."));
    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", file);
    xhr.send(body);
  });

  return storage.getPublicUrl(path).data.publicUrl;
}
