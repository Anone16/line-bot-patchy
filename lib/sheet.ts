export interface FaqItem {
  question: string;
  answer: string;
  category: string;
}

const CACHE_TTL_MS = 60_000;

let cache: { data: FaqItem[]; timestamp: number } | null = null;

export async function getFaq(): Promise<FaqItem[]> {
  const now = Date.now();
  if (cache && now - cache.timestamp < CACHE_TTL_MS) {
    return cache.data;
  }

  const sheetUrl = process.env.SHEET_CSV_URL;
  if (!sheetUrl) {
    throw new Error("SHEET_CSV_URL is not set");
  }

  try {
    const res = await fetch(sheetUrl, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Sheet fetch failed with status ${res.status}`);
    }
    const csv = await res.text();
    const data = parseFaqCsv(csv);
    cache = { data, timestamp: now };
    return data;
  } catch (err) {
    console.error("[sheet] failed to fetch FAQ sheet:", err);
    if (cache) {
      console.warn("[sheet] falling back to stale cache");
      return cache.data;
    }
    throw err;
  }
}

export function formatFaqForPrompt(items: FaqItem[]): string {
  return items
    .map((item) => `Q: ${item.question}\nA: ${item.answer}\nหมวด: ${item.category}`)
    .join("\n\n");
}

function parseFaqCsv(csv: string): FaqItem[] {
  const rows = parseCsvRows(csv);
  if (rows.length === 0) return [];

  const [header, ...body] = rows;
  const qIdx = header.findIndex((h) => h.trim() === "คำถาม");
  const aIdx = header.findIndex((h) => h.trim() === "คำตอบ");
  const cIdx = header.findIndex((h) => h.trim() === "หมวด");

  return body
    .filter((row) => row.some((cell) => cell.trim() !== ""))
    .map((row) => ({
      question: (row[qIdx] ?? "").trim(),
      answer: (row[aIdx] ?? "").trim(),
      category: (row[cIdx] ?? "").trim(),
    }))
    .filter((item) => item.question && item.answer);
}

function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];

    if (inQuotes) {
      if (char === '"') {
        if (csv[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char === "\r") {
      continue;
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}
