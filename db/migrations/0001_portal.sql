CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_name text NOT NULL, title text NOT NULL,
  instructions text NOT NULL, reward_work integer NOT NULL DEFAULT 0 CHECK (reward_work >= 0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','draft_review','closed')),
  kind text NOT NULL CHECK (kind IN ('voice','annotation')), required_submissions integer NOT NULL DEFAULT 0,
  submitted_count integer NOT NULL DEFAULT 0, funding_usdc numeric(12,2) NOT NULL DEFAULT 0,
  voucher_sponsor text, future_contract_id uuid, provenance jsonb NOT NULL DEFAULT '{"source":"client-provided","synthetic":false}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), task_id uuid NOT NULL REFERENCES tasks(id), worker_name text NOT NULL,
  wallet_address text, consent jsonb NOT NULL, status text NOT NULL DEFAULT 'pending_review', final_reward_work integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz
);
CREATE TABLE IF NOT EXISTS contribution_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), submission_id uuid NOT NULL UNIQUE REFERENCES submissions(id), storage_reference text NOT NULL,
  content_sha256 char(64) NOT NULL, consent_policy_version text NOT NULL, status text NOT NULL DEFAULT 'awaiting_review', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS portal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_type text NOT NULL, payload jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO tasks (client_name,title,instructions,reward_work,status,kind,required_submissions,funding_usdc,voucher_sponsor)
SELECT * FROM (VALUES
 ('Northstar Labs','Localized product phrase','Read the generated phrase naturally in a quiet setting.',12,'open','voice',100,12.00,'Northstar Labs'),
 ('Northstar Labs','Classify a support message','Choose the category that best matches the message.',6,'open','annotation',50,3.00,'Northstar Labs')
) AS seed(client_name,title,instructions,reward_work,status,kind,required_submissions,funding_usdc,voucher_sponsor)
WHERE NOT EXISTS (SELECT 1 FROM tasks);
