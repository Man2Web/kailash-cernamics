-- Additive only: shared store for login throttling. No existing data is touched.
CREATE TABLE "login_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "login_attempts_key_created_at_idx" ON "login_attempts"("key", "created_at");

-- Not exposed through the Supabase REST API to anon/authenticated roles; only the service role can use it.
ALTER TABLE "login_attempts" ENABLE ROW LEVEL SECURITY;
