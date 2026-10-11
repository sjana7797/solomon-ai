-- Runs only on a fresh postgres volume. LiteLLM gets its own DB so its Prisma
-- migrations never touch the app database.
CREATE DATABASE litellm;
