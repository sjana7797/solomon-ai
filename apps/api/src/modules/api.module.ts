import { Module } from "@nestjs/common";
import { FinanceModule } from "./finance/index.js";
import { HealthModule } from "./health/index.js";

@Module({
  imports: [HealthModule, FinanceModule],
})
export class ApiModule {}
