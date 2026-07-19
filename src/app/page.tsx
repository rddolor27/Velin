"use client";

import dynamic from "next/dynamic";

// PDF.js touches window/worker at import time, so the editor must be client-only.
const Editor = dynamic(() => import("@/components/editor/editor").then((m) => m.Editor), {
  ssr: false,
});

export default function Home() {
  return <Editor />;
}
