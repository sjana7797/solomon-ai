import { Module } from "@nestjs/common";

import { FinanceController } from "./finance.controller.js";
import { FinanceService } from "./finance.service.js";
import { MARKET_DATA_PROVIDER } from "./providers/market-data.provider.js";
import { YahooFinanceProvider } from "./providers/yahoo-finance.provider.js";

@Module({
  controllers: [FinanceController],
  providers: [
    FinanceService,
    // Swap for a licensed data provider in production.
    { provide: MARKET_DATA_PROVIDER, useClass: YahooFinanceProvider },
  ],
  exports: [FinanceService],
})
export class FinanceModule {}
