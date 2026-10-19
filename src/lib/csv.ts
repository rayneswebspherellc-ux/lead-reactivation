/**
 * RFC 4180 CSV reader: quoted fields may hold commas, quotes ("") and line
 * breaks, which LinkedIn's messages.csv uses for multi-line messages.
 * Yields one row at a time so very large files are not held as rows twice.
 */
export function* readCsv(text: string, delimiter = ","): Generator<string[]> {
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"' && field === "") {
      inQuotes = true;
      i++;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
      i++;
    } else if (c === "\r" || c === "\n") {
      row.push(field);
      field = "";
      if (c === "\r" && text[i + 1] === "\n") i++;
      i++;
      if (row.length > 1 || row[0] !== "") yield row;
      row = [];
    } else {
      field += c;
      i++;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    yield row;
  }
}

/** Header name to column index, matched case-insensitively and ignoring spaces/underscores. */
export function headerIndex(header: string[]): (name: string) => number {
  const key = (s: string) => s.toLowerCase().replace(/[\s_]+/g, "");
  const map = new Map(header.map((h, i) => [key(h), i]));
  return (name) => map.get(key(name)) ?? -1;
}
