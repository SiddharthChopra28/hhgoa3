// Temporary public hosting for the input image so reverse-image-search APIs
// (which require a fetchable URL) can retrieve it. Defaults to free,
// no-auth hosts. Overridable via env for S3/R2/Vercel Blob if desired.

export interface HostResult {
  url: string;
  provider: string;
}

async function uploadCatbox(buffer: Uint8Array, filename: string): Promise<string> {
  const form = new FormData();
  form.append('reqtype', 'fileupload');
  form.append('fileToUpload', new Blob([buffer as BlobPart]), filename);
  const res = await fetch('https://catbox.moe/user/api.php', { method: 'POST', body: form });
  const text = (await res.text()).trim();
  if (!text.startsWith('http')) throw new Error(`catbox upload failed: ${text}`);
  return text;
}

async function uploadTmpfiles(buffer: Uint8Array, filename: string): Promise<string> {
  const form = new FormData();
  form.append('file', new Blob([buffer as BlobPart]), filename);
  const res = await fetch('https://tmpfiles.org/api/v1/upload', { method: 'POST', body: form });
  const json = (await res.json()) as { status: string; data?: { url?: string } };
  if (json.status !== 'success' || !json.data?.url) throw new Error(`tmpfiles upload failed: ${JSON.stringify(json)}`);
  return json.data.url;
}

export async function hostImage(buffer: Uint8Array, filename: string): Promise<HostResult> {
  const provider = (process.env.IMAGE_HOST || 'catbox').toLowerCase();
  let url: string;
  if (provider === 'tmpfiles') {
    url = await uploadTmpfiles(buffer, filename);
  } else if (provider === 'catbox') {
    url = await uploadCatbox(buffer, filename);
  } else {
    throw new Error(`Unknown IMAGE_HOST: ${provider}. Supported: catbox, tmpfiles`);
  }
  return { url, provider };
}
