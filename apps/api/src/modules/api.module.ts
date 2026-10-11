import { Module } from "@nestjs/common";
import { HealthModule } from "./health/index.js";

@Module({
  imports: [HealthModule],
})
export class ApiModule {}
