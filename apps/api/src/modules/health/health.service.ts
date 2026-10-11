import { Injectable } from "@nestjs/common";
import {
  DiskHealthIndicator,
  HealthCheckService,
  MemoryHealthIndicator,
} from "@nestjs/terminus";

const MB = 1024 * 1024;

@Injectable()
export class HealthService {
  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
    private readonly disk: DiskHealthIndicator,
  ) {}

  check() {
    return this.health.check([
      () => this.memory.checkHeap("memory_heap", 300 * MB),
      () => this.memory.checkRSS("memory_rss", 512 * MB),
      () =>
        this.disk.checkStorage("disk", { path: "/", thresholdPercent: 0.9 }),
    ]);
  }

  live() {
    return this.health.check([]);
  }
}
