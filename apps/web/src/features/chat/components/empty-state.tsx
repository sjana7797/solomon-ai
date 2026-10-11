import { CodeIcon, LightbulbIcon, NotebookPenIcon, PlaneIcon } from "lucide-react";

const SUGGESTIONS = [
  { icon: LightbulbIcon, tint: "bg-chart-1", label: "Explain a concept", prompt: "Explain how vector databases work, with a simple analogy." },
  { icon: CodeIcon, tint: "bg-chart-2", label: "Write some code", prompt: "Write a TypeScript debounce function with tests." },
  { icon: NotebookPenIcon, tint: "bg-chart-3", label: "Summarize a book", prompt: "Summarize the key ideas of the book Atomic Habits." },
  { icon: PlaneIcon, tint: "bg-chart-4", label: "Plan a trip", prompt: "Plan a relaxed 3-day trip to Kyoto in autumn." },
];

export function EmptyState({
  onPick,
  children,
}: {
  onPick: (prompt: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 pt-6 pb-[12vh]">
      <div className="flex w-full max-w-2xl flex-col gap-7">
        <div className="space-y-2 text-center">
          <h1 className="font-display text-[2.5rem] leading-[1.05] tracking-[-0.02em] text-balance sm:text-5xl">
            What&apos;s on your <em className="text-primary-foreground dark:text-primary">mind</em>?
          </h1>
          <p className="text-sm text-muted-foreground">
            Ask a question, draft something, or think out loud.
          </p>
        </div>

        {children}

        <div className="flex flex-wrap justify-center gap-2">
          {SUGGESTIONS.map(({ icon: Icon, tint, label, prompt }) => (
            <button
              key={label}
              type="button"
              title={prompt}
              onClick={() => onPick(prompt)}
              className="group inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/60 py-1.5 pr-3.5 pl-1.5 text-sm text-muted-foreground transition-[color,background-color,border-color,translate] duration-200 ease-out hover:-translate-y-px hover:border-border hover:bg-card hover:text-foreground"
            >
              <span
                className={`grid size-6 place-items-center rounded-full text-primary-foreground ${tint}`}
              >
                <Icon className="size-3.5" />
              </span>
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
