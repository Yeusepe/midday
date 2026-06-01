import type { EditorDoc } from "../types";

export function isValidJSON(str: string | null | undefined): boolean {
  if (!str) return false;
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

export function hasEditorContent(doc?: EditorDoc | null): boolean {
  return (
    doc?.content?.some((node) =>
      node.content?.some(
        (inlineContent) =>
          inlineContent.type === "text" && Boolean(inlineContent.text?.trim()),
      ),
    ) ?? false
  );
}
