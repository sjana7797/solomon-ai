import { Module } from "@nestjs/common";
import { ApiModule } from "./modules/api.module.js";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TEnv, validateEnv } from "@solomon/env/api";
import { LoggerModule } from "pino-nestjs";
import { DrizzleModule } from "@nestjs/drizzle";
import { drizzle } from "drizzle-orm/node-postgres";

@Module({
  imports: [
    ApiModule,

    // Env
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),

    LoggerModule.forRootAsync({
      inject: [ConfigService],
      imports: [ConfigModule],
      providers: [ConfigService],
      useFactory(configService: ConfigService<TEnv>) {
        const logLevel =
          configService.get("LOG_LEVEL", { infer: true }) ?? "info";
        const prettyLog =
          configService.get("PRETTY_LOG", { infer: true }) ?? false;

        return {
          pinoHttp: {
            level: logLevel,
            transport: prettyLog
              ? {
                  target: "pino-pretty",
                  options: {
                    colorize: true,
                    translateTime: "SYS:standard",
                    ignore: "pid,hostname",
                  },
                }
              : undefined,
          },
        };
      },
    }),

    DrizzleModule.forRootAsync({
      inject: [ConfigService],
      imports: [ConfigModule],
      useFactory(configService: ConfigService<TEnv>) {
        const DATABASE_URL = configService.getOrThrow("DATABASE_URL", {
          infer: true,
        });

        return {
          drizzle,
          connection: DATABASE_URL,
          autoCloseConnection: true,
        };
      },
    }),
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
