import { CodeBlock } from "@repo/ui/components/agents/code-block";
import type { AgentCodeLanguage } from "@repo/ui/components/agents/agent-code";
import { isValidElement, useMemo, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import type { Source } from "../types";

const CITE_PREFIX = "#cite-";

/**
 * Turn [n] citation markers into links the renderer swaps for citation chips.
 * Also normalizes gpt-oss's native 【n】 / 【n†L1-L4】 styles. Code blocks are left alone.
 */
function linkCitations(markdown: string, sources: Source[]) {
  const known = new Set(sources.map((s) => s.index));
  return markdown
    .split(/(```[\s\S]*?(?:```|$))/)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part
            .replace(/【(\d+)(?:†[^】]*)?】/g, "[$1]")
            .replace(/\[(\d+)\](?![(:])/g, (match, n: string) =>
              known.has(Number(n)) ? `[${n}](${CITE_PREFIX}${n})` : match,
            ),
    )
    .join("");
}

const LANGUAGES: Record<string, AgentCodeLanguage> = {
  ts: "typescript",
  typescript: "typescript",
  tsx: "tsx",
  jsx: "tsx",
  js: "tsx",
  javascript: "tsx",
  json: "json",
  bash: "bash",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  diff: "diff",
};

const components: Components = {
  a: (props) => <a target="_blank" rel="noreferrer" {...props} />,
  h1: (props) => <h1 className="mt-5 mb-2 text-lg font-semibold" {...props} />,
  h2: (props) => <h2 className="mt-5 mb-2 text-base font-semibold" {...props} />,
  h3: (props) => <h3 className="mt-4 mb-1.5 font-semibold" {...props} />,
  blockquote: (props) => (
    <blockquote className="my-3 border-l-2 border-primary pl-4 text-muted-foreground" {...props} />
  ),
  hr: () => <hr className="my-5" />,
  table: (props) => (
    <div className="my-3 overflow-x-auto rounded-xl border">
      <table className="w-full text-sm" {...props} />
    </div>
  ),
  th: (props) => <th className="border-b bg-muted/50 px-3 py-2 text-left font-medium" {...props} />,
  td: (props) => <td className="border-b px-3 py-2" {...props} />,
};

function codeFromPre(children: ReactNode) {
  if (!isValidElement<{ className?: string; children?: ReactNode }>(children)) {
    return null;
  }
  const lang = /language-([\w-]+)/.exec(children.props.className ?? "")?.[1];
  return {
    code: String(children.props.children ?? "").replace(/\n$/, ""),
    language: (lang && LANGUAGES[lang.toLowerCase()]) || "text",
    filename: lang,
  };
}

export function Markdown({
  children,
  streaming = false,
  citations,
  onCitationClick,
}: {
  children: string;
  streaming?: boolean;
  citations?: Source[];
  onCitationClick?: (index: number) => void;
}) {
  const withCode = useMemo<Components>(
    () => ({
      ...components,
      a: ({ href, children: linkChildren, ...props }) => {
        if (href?.startsWith(CITE_PREFIX)) {
          const n = Number(href.slice(CITE_PREFIX.length));
          const source = citations?.find((s) => s.index === n);
          return (
            <button
              type="button"
              title={source ? `${source.title} — ${source.domain}` : undefined}
              aria-label={`View source ${n}`}
              onClick={() => onCitationClick?.(n)}
              className="mx-0.5 inline-flex min-w-4 -translate-y-0.5 items-center justify-center rounded-md bg-primary/20 px-1 py-0.5 align-baseline text-[10px] leading-none font-semibold text-accent-foreground transition-colors hover:bg-primary/40"
            >
              {n}
            </button>
          );
        }
        return (
          <a href={href} target="_blank" rel="noreferrer" {...props}>
            {linkChildren}
          </a>
        );
      },
      pre: ({ children: preChildren }) => {
        const block = codeFromPre(preChildren);
        if (!block) return <pre>{preChildren}</pre>;
        return (
          <CodeBlock
            className="my-3"
            code={block.code}
            language={block.language}
            filename={block.filename}
            status={streaming ? "streaming" : "complete"}
            copyable
          />
        );
      },
    }),
    [streaming, citations, onCitationClick],
  );

  const source = useMemo(
    () => (citations?.length ? linkCitations(children, citations) : children),
    [children, citations],
  );

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={withCode}>
      {source}
    </ReactMarkdown>
  );
}
