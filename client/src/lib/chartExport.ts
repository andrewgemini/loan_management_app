const THAI_PDF_FONT_URL = "/manus-storage/NotoLoopedThai-Regular_8a3dbab5.ttf";

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return window.btoa(binary);
}

function filename(prefix: string, extension: "png" | "pdf") {
  return `${prefix}_${new Date().toISOString().slice(0, 10)}.${extension}`;
}

export function downloadChartPng(dataUrl: string, prefix: string) {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename(prefix, "png");
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

export async function downloadChartPdf(dataUrl: string, title: string, subtitle: string, prefix: string) {
  const [{ jsPDF }, fontResponse] = await Promise.all([import("jspdf"), fetch(THAI_PDF_FONT_URL)]);
  if (!fontResponse.ok) throw new Error("ไม่สามารถโหลดฟอนต์ภาษาไทยสำหรับ PDF ได้");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const fontBase64 = toBase64(await fontResponse.arrayBuffer());
  doc.addFileToVFS("NotoLoopedThai-Regular.ttf", fontBase64);
  doc.addFont("NotoLoopedThai-Regular.ttf", "NotoLoopedThai", "normal");
  doc.setFont("NotoLoopedThai", "normal");
  doc.setFontSize(16);
  doc.text(title, 14, 16);
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(subtitle, 14, 23);
  doc.setTextColor(0, 0, 0);
  doc.addImage(dataUrl, "PNG", 14, 30, 269, 152, undefined, "FAST");
  doc.save(filename(prefix, "pdf"));
}
