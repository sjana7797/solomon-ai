import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
} from "@nestjs/common";
import { ApiQuery, ApiTags } from "@nestjs/swagger";

import { FINANCE_ROUTES } from "@/constants/routes/index.js";
import { FinanceService } from "./finance.service.js";
import {
  HISTORY_RANGES,
  type HistoryRange,
  type Market,
} from "./finance.types.js";

// Market data may be delayed and is not investment advice.
@ApiTags(FINANCE_ROUTES.tag)
@Controller(FINANCE_ROUTES.BASE)
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get(FINANCE_ROUTES.OVERVIEW)
  @ApiQuery({ name: "market", enum: ["IN", "US"], required: false })
  overview(@Query("market") market = "IN") {
    if (market !== "IN" && market !== "US")
      throw new BadRequestException("market must be IN or US");
    return this.finance.overview(market as Market);
  }

  @Get(FINANCE_ROUTES.QUOTES)
  @ApiQuery({
    name: "symbols",
    description: "Comma-separated, e.g. RELIANCE.NS,AAPL",
  })
  quotes(@Query("symbols") symbols = "") {
    return this.finance.quotes(symbols.split(","));
  }

  @Get(FINANCE_ROUTES.SEARCH)
  search(@Query("q") q = "") {
    return this.finance.search(q);
  }

  @Get(FINANCE_ROUTES.HISTORY)
  @ApiQuery({ name: "range", enum: HISTORY_RANGES, required: false })
  history(@Param("symbol") symbol: string, @Query("range") range = "1mo") {
    if (!HISTORY_RANGES.includes(range as HistoryRange)) {
      throw new BadRequestException(
        `range must be one of ${HISTORY_RANGES.join(", ")}`,
      );
    }
    return this.finance.history(symbol, range as HistoryRange);
  }

  @Get(FINANCE_ROUTES.STOCK)
  stock(@Param("symbol") symbol: string) {
    return this.finance.stock(symbol);
  }
}
