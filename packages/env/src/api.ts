import { z } from "zod";

export const ENVSchema = z.object({
  PORT: z.coerce.number().default(3001),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error"])
    .default("info"),
  PRETTY_LOG: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),

  SWAGGER_ENABLE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  SWAGGER_USER: z.string().default("admin"),
  SWAGGER_PASSWORD: z.string().default("admin"),
  DATABASE_URL: z.url().nonempty("DATABASE_URL is required"),
});

export type TEnv = z.infer<typeof ENVSchema>;

export const validateEnv = (config: Record<string, unknown>): TEnv => {
  const result = ENVSchema.safeParse(config);
  if (!result.success) {
    throw new Error(
      `Invalid environment variables: ${JSON.stringify(z.treeifyError(result.error))}`,
    );
  }
  return result.data;
};
