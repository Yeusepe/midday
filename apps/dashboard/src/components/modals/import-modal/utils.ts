import {
  decodeImportCsvContent,
  normalizeImportCsvContent,
} from "@midday/import";

export const readLines = async (file: File, count = 4): Promise<string> => {
  const content = decodeImportCsvContent(await file.arrayBuffer());
  const normalizedContent = normalizeImportCsvContent(content);

  return normalizedContent
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .slice(0, count)
    .join("\n");
};
