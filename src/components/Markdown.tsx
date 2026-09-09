function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function Markdown({ source }: { source: string }) {
  const html = renderMarkdown(source);
  return <div className="prose-notes" dangerouslySetInnerHTML={{ __html: html }} />;
}

function renderMarkdown(source: string) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let inList = false;
  let inTable = false;

  const closeList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith("|") && line.includes("|")) {
      closeList();
      if (!inTable) {
        out.push("<table>");
        inTable = true;
      }
      const cells = line.split("|").slice(1, -1).map((c) => c.trim());
      if (cells.every((c) => /^[-:]+$/.test(c))) continue;
      const tag = out[out.length - 1] === "<table>" ? "th" : "td";
      out.push("<tr>" + cells.map((c) => `<${tag}>${inline(c)}</${tag}>`).join("") + "</tr>");
      continue;
    }
    if (inTable) {
      out.push("</table>");
      inTable = false;
    }
    if (line.startsWith("## ")) {
      closeList();
      out.push(`<h2>${inline(line.slice(3))}</h2>`);
    } else if (line.startsWith("### ")) {
      closeList();
      out.push(`<h3>${inline(line.slice(4))}</h3>`);
    } else if (line.startsWith("> ")) {
      closeList();
      out.push(`<blockquote>${inline(line.slice(2))}</blockquote>`);
    } else if (/^[-*]\s+/.test(line)) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${inline(line.replace(/^[-*]\s+/, ""))}</li>`);
    } else if (!line.trim()) {
      closeList();
    } else {
      closeList();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  closeList();
  if (inTable) out.push("</table>");
  return out.join("\n");
}

function inline(text: string) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}
