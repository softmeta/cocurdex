import { fileURLToPath } from "node:url";
import {
  SAMPLE_PDF_KEYWORD,
  SAMPLE_PDF_PAGES,
  SAMPLE_PDF_PATH,
} from "./sample-pdf.mjs";

export const PDF_FIXTURES = {
  sample: {
    path: SAMPLE_PDF_PATH,
    page: 10,
    query: SAMPLE_PDF_KEYWORD,
    matches: SAMPLE_PDF_PAGES,
  },
  book: {
    path: fileURLToPath(
      new URL("./ai-agents-in-depth-zh-CN.pdf", import.meta.url),
    ),
    page: 285,
    query: "harness",
    matches: 249,
  },
};
