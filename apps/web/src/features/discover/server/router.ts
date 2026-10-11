import { z } from "zod";

import { baseProcedure, createTRPCRouter } from "@/trpc/init";

import { COUNTRY_CODES, TOPIC_IDS } from "../config";
import { getNews } from "./news";

export const discoverRouter = createTRPCRouter({
  feed: baseProcedure
    .input(z.object({ country: z.enum(COUNTRY_CODES), topic: z.enum(TOPIC_IDS) }))
    .query(({ input }) => getNews(input.country, input.topic)),
});
