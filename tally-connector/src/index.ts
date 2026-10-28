import { SyncPoller } from "./queue/poller";

console.log("=================================================");
console.log("    SIXORBIT ERP -> TALLYPRIME LOCAL CONNECTOR   ");
console.log("=================================================");

const poller = new SyncPoller();

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\nReceived SIGINT. Shutting down bridge gracefully...");
  poller.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\nReceived SIGTERM. Shutting down bridge gracefully...");
  poller.stop();
  process.exit(0);
});

poller.start().catch((err) => {
  console.error("Fatal error starting Tally Connector:", err);
  process.exit(1);
});
