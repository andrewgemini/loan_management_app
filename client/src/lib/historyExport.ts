export type ExportColumn<T> = {
  header: string;
  value: (row: T) => string | number;
};

export type HistoryExportOptions<T> = {
  title: string;
  subtitle?: string;
  filenamePrefix: string;
  columns: ExportColumn<T>[];
  rows: T[];
  referenceCode?: string;
  watermark?: string;
};

const THAI_PDF_FONT_URL = "/manus-storage/NotoLoopedThai-Regular_8a3dbab5.ttf";

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }

  return window.btoa(binary);
}

export function escapeCSVValue(value: string | number): string {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function createHistoryCSV<T>(options: HistoryExportOptions<T>): string {
  const rows = [
    [options.title],
    options.subtitle ? [options.subtitle] : [],
    [],
    options.columns.map((column) => column.header),
    ...options.rows.map((row) => options.columns.map((column) => column.value(row))),
  ];

  return rows.map((row) => row.map(escapeCSVValue).join(",")).join("\n");
}

export function createExportFilename(prefix: string, extension: "csv" | "pdf"): string {
  const date = new Date().toISOString().slice(0, 10);
  return `${prefix}_${date}.${extension}`;
}

export function downloadTextFile(content: string, filename: string, contentType: string) {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadHistoryCSV<T>(options: HistoryExportOptions<T>) {
  const csv = `\uFEFF${createHistoryCSV(options)}`;
  downloadTextFile(csv, createExportFilename(options.filenamePrefix, "csv"), "text/csv;charset=utf-8;");
}

export async function downloadHistoryPDF<T>(options: HistoryExportOptions<T>) {
  const [{ jsPDF }, autoTableModule, fontResponse] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
    fetch(THAI_PDF_FONT_URL),
  ]);

  if (!fontResponse.ok) {
    throw new Error("ไม่สามารถโหลดฟอนต์ภาษาไทยสำหรับ PDF ได้");
  }

  const autoTable = autoTableModule.default;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const fontBase64 = toBase64(await fontResponse.arrayBuffer());
  doc.addFileToVFS("NotoLoopedThai-Regular.ttf", fontBase64);
  doc.addFont("NotoLoopedThai-Regular.ttf", "NotoLoopedThai", "normal");
  doc.setFont("NotoLoopedThai", "normal");
  doc.setFontSize(16);
  doc.text(options.title, 14, 14);

  if (options.subtitle) {
    doc.setFontSize(10);
    doc.text(options.subtitle, 14, 21);
  }

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  autoTable(doc, {
    head: [options.columns.map((column) => column.header)],
    body: options.rows.map((row) => options.columns.map((column) => String(column.value(row)))),
    startY: options.subtitle ? 26 : 20,
    styles: {
      font: "NotoLoopedThai",
      fontStyle: "normal",
      fontSize: 9,
      cellPadding: 2,
    },
    headStyles: {
      fillColor: [5, 150, 105],
      textColor: [255, 255, 255],
      font: "NotoLoopedThai",
      fontStyle: "normal",
    },
    alternateRowStyles: { fillColor: [240, 253, 244] },
    margin: { left: 10, right: 10 },
    willDrawPage: () => {
      if (!options.watermark) return;
      doc.setTextColor(219, 229, 245);
      doc.setFontSize(28);
      doc.text(options.watermark, pageWidth / 2, pageHeight / 2, { align: "center", angle: 28 });
      doc.setTextColor(0, 0, 0);
    },
    didDrawPage: () => {
      if (!options.referenceCode) return;
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(`Reference: ${options.referenceCode}`, 14, pageHeight - 8);
      doc.text(`Page ${doc.getCurrentPageInfo().pageNumber}`, pageWidth - 14, pageHeight - 8, { align: "right" });
      doc.setTextColor(0, 0, 0);
    },
  });

  doc.save(createExportFilename(options.filenamePrefix, "pdf"));
}
