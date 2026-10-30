"use client";

/** Download rows as an .xlsx file (exceljs is loaded on demand to keep pages light). */
export async function exportToExcel(fileName: string, columns: { header: string; key: string; width?: number }[], rows: Record<string, unknown>[]) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Kailash Ceramics ERP";
  const ws = wb.addWorksheet("Data");
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? Math.max(12, c.header.length + 4) }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  for (const r of rows) ws.addRow(r);
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileName}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Read the first sheet of an uploaded .xlsx/.csv into objects keyed by the header row. */
export async function readSpreadsheet(file: File): Promise<Record<string, string>[]> {
  if (file.name.toLowerCase().endsWith(".csv")) {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    const parse = (line: string) => {
      const out: string[] = [];
      let cur = "";
      let q = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (q && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else q = !q;
        } else if (ch === "," && !q) {
          out.push(cur);
          cur = "";
        } else cur += ch;
      }
      out.push(cur);
      return out.map((s) => s.trim());
    };
    const [head, ...rest] = lines.map(parse);
    return rest.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
  }
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  const rows: Record<string, string>[] = [];
  const head: string[] = [];
  ws.getRow(1).eachCell((c, i) => (head[i] = String(c.text).trim()));
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const o: Record<string, string> = {};
    head.forEach((h, i) => h && (o[h] = String(row.getCell(i).text ?? "").trim()));
    if (Object.values(o).some(Boolean)) rows.push(o);
  });
  return rows;
}
