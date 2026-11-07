// Browser-side file reading: text-like files as text, DOCX unzipped to text,
// everything else (PDF, images) as a data URL for the AI to read.
import { unzipSync, strFromU8 } from "fflate";

const TEXT_EXT = /\.(txt|md|csv|tsv|json|xml|html?|ya?ml|log|ini|toml)$/i;

export async function readEvidenceFile(file: File): Promise<{ filename: string; mime: string; text?: string; dataUrl?: string }> {
  const mime = file.type || "application/octet-stream";
  if (mime.startsWith("text/") || mime.includes("json") || mime.includes("xml") || TEXT_EXT.test(file.name)) {
    return { filename: file.name, mime, text: await file.text() };
  }
  if (/\.docx$/i.test(file.name)) {
    const files = unzipSync(new Uint8Array(await file.arrayBuffer()));
    const xml = files["word/document.xml"];
    if (xml) {
      const text = strFromU8(xml)
        .replace(/<\/w:p>/g, "\n")
        .replace(/<w:tab\/>/g, "\t")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");
      return { filename: file.name, mime, text };
    }
  }
  if (file.size > 8 * 1024 * 1024) throw new Error("File is larger than 8 MB.");
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
  return { filename: file.name, mime, dataUrl };
}
