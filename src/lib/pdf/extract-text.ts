// Client-side PDF text extraction using pdfjs-dist v6.
// Must only be called in the browser (uses Web APIs).

import * as pdfjsLib from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

let workerInitialized = false;

function ensureWorker() {
  if (!workerInitialized) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
    workerInitialized = true;
  }
}

export async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
  ensureWorker();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pageTexts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const lineText = content.items
      .filter((item): item is TextItem => "str" in item)
      .map((item) => item.str)
      .join(" ");
    pageTexts.push(lineText);
  }
  return pageTexts.join("\n");
}
