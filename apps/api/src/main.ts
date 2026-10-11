import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import compression from "compression";
import { ConfigService } from "@nestjs/config";
import { TEnv } from "@solomon/env/api";
import { Logger } from "pino-nestjs";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Logger
  app.useLogger(app.get(Logger));
  const logger = app.get(Logger);

  const config = app.get(ConfigService<TEnv>);

  // global prefix
  app.setGlobalPrefix("api");

  // enable cors
  app.enableCors();

  // security headers
  app.useSecurityHeaders();

  app.use(compression());

  // Cookies
  app.use(cookieParser("my-secret"));

  // Swagger config
  const swaggerConfig = new DocumentBuilder()
    .setTitle("Solomon API")
    .setDescription("The cats API description")
    .setVersion("1.0")
    .addTag("solomon")
    .build();
  const documentFactory = () =>
    SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api/docs", app, documentFactory);

  // Config
  const PORT = config.getOrThrow("PORT", { infer: true });

  logger.log(`Starting server on port ${PORT}...`);

  await app.listen(PORT);
}
await bootstrap();
