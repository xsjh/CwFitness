ALTER TABLE "user" ADD COLUMN "telemetryEnabled" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "telemetry_event" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "telemetry_event_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "telemetry_event_userId_createdAt_idx" ON "telemetry_event"("userId", "createdAt");
ALTER TABLE "telemetry_event" ADD CONSTRAINT "telemetry_event_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
