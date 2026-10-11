"use client";

import { AnimatedSidebarTrigger } from "@repo/ui/components/motion/animated-sidebar";
import { Button } from "@repo/ui/components/motion/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@repo/ui/components/motion/select";
import { Tabs, TabsList, TabsTrigger } from "@repo/ui/components/motion/tabs";
import { useQuery } from "@tanstack/react-query";
import { MapPinIcon, PanelLeftIcon } from "lucide-react";
import { useState } from "react";

import { usePreferredModel, useSendMessage } from "@/features/chat";
import { useTRPC } from "@/trpc/client";

import { COUNTRIES, TOPICS, type CountryCode, type NewsItem, type TopicId } from "../config";
import { useCountry } from "../hooks/use-country";
import { NewsCard } from "./news-card";

function CountrySelect({
  value,
  onChange,
}: {
  value: CountryCode;
  onChange: (country: CountryCode) => void;
}) {
  const name = COUNTRIES.find((c) => c.code === value)?.name;
  return (
    <Select value={value} onValueChange={(v) => onChange(v as CountryCode)} className="w-auto">
      <SelectTrigger className="h-9 w-auto rounded-full border-border/70 bg-card px-3.5 text-sm">
        <span className="flex items-center gap-2">
          <MapPinIcon className="size-3.5 text-muted-foreground" />
          {name}
        </span>
      </SelectTrigger>
      <SelectContent className="right-0 left-auto w-56">
        {COUNTRIES.map((country) => (
          <SelectItem key={country.code} value={country.code} className="py-2 text-sm">
            {country.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function FeedSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading stories" className="space-y-8">
      <div className="grid gap-5 p-2 md:grid-cols-[1.35fr_1fr]">
        <div className="aspect-[16/10] animate-pulse rounded-2xl bg-muted" />
        <div className="space-y-3 self-center">
          <div className="h-8 w-11/12 animate-pulse rounded-lg bg-muted" />
          <div className="h-8 w-3/4 animate-pulse rounded-lg bg-muted" />
          <div className="h-4 w-full animate-pulse rounded bg-muted" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="space-y-3 p-2">
            <div className="aspect-[16/9] animate-pulse rounded-xl bg-muted" />
            <div className="h-4 w-11/12 animate-pulse rounded bg-muted" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}

function Feed({
  country,
  topic,
  onAsk,
  canAsk,
}: {
  country: CountryCode;
  topic: TopicId;
  onAsk: (item: NewsItem) => void;
  canAsk: boolean;
}) {
  const trpc = useTRPC();
  const { data, isPending, isError, refetch, isRefetching } = useQuery(
    trpc.discover.feed.queryOptions({ country, topic }, { staleTime: 10 * 60 * 1000 }),
  );

  if (isPending) return <FeedSkeleton />;
  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-center">
        <p className="font-medium">Couldn&apos;t load the news.</p>
        <p className="text-sm text-muted-foreground">
          The news search service didn&apos;t respond. Check that SearXNG is running, then retry.
        </p>
        <Button variant="secondary" size="sm" onClick={() => void refetch()} disabled={isRefetching}>
          {isRefetching ? "Retrying…" : "Retry"}
        </Button>
      </div>
    );
  }
  if (data.length === 0) {
    return (
      <p className="py-24 text-center text-sm text-muted-foreground">
        No stories for this topic right now. Try another topic or country.
      </p>
    );
  }

  const [lead, ...rest] = data;
  return (
    <div className="space-y-8">
      {lead && <NewsCard item={lead} lead canAsk={canAsk} onAsk={() => onAsk(lead)} />}
      <div className="grid gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
        {rest.map((item) => (
          <NewsCard key={item.id} item={item} canAsk={canAsk} onAsk={() => onAsk(item)} />
        ))}
      </div>
    </div>
  );
}

export function DiscoverPage() {
  const [country, setCountry] = useCountry();
  const [topic, setTopic] = useState<TopicId>("top");
  const [model] = usePreferredModel();
  const send = useSendMessage();

  const ask = (item: NewsItem) => {
    if (!model) return;
    void send({
      text: `Tell me about this story: "${item.title}" (${item.url})`,
      model,
      thinking: false,
      webSearch: true,
    });
  };

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-2 px-3">
        <AnimatedSidebarTrigger className="size-8 rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <PanelLeftIcon className="size-4" />
        </AnimatedSidebarTrigger>
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-4 pb-16 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4 pt-2 pb-6">
            <div>
              <h1 className="font-display text-4xl tracking-[-0.02em] sm:text-5xl">Discover</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                What&apos;s happening this week, from the web.
              </p>
            </div>
            {country && <CountrySelect value={country} onChange={setCountry} />}
          </div>

          <div className="sticky top-0 z-20 -mx-4 mb-6 bg-background/85 px-4 py-2 backdrop-blur-md sm:-mx-6 sm:px-6">
            <Tabs value={topic} onValueChange={(v) => setTopic(v as TopicId)} variant="pill">
              <TabsList className="scrollbar-hide max-w-full overflow-x-auto bg-muted">
                {TOPICS.map((t) => (
                  <TabsTrigger key={t.id} value={t.id}>
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          {country ? (
            <Feed country={country} topic={topic} onAsk={ask} canAsk={Boolean(model)} />
          ) : (
            <FeedSkeleton />
          )}
        </div>
      </div>
    </>
  );
}
