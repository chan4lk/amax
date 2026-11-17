"use client";

import type { FileRef } from "@amax/chat";

const LABEL = { pdf: "PDF", docx: "DOC", md: "MD" } as const;

export function FileCard({ file }: { file: FileRef }) {
  return (
    <div className={`filecard ${file.format}`}>
      <span className="filecard-icon" aria-hidden="true">{LABEL[file.format]}</span>
      <span className="filecard-text"><b>{file.title}</b><small>{file.detail}</small></span>
      <a className="btn primary sm" href={file.href} download>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m-4-4 4 4 4-4M5 20h14" /></svg>Download<span className="sr"> {file.title}</span>
      </a>
    </div>
  );
}
