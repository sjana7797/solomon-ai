import { Controller, Get } from "@nestjs/common";
import { HealthCheck } from "@nestjs/terminus";
import { HealthService } from "./health.service.js";
import { HEALTH_ROUTES } from "@/constants/routes/index.js";

@Controller(HEALTH_ROUTES.BASE)
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @HealthCheck()
  check() {
    return this.healthService.check();
  }

  @Get("live")
  @HealthCheck()
  live() {
    return this.healthService.live();
  }
}
