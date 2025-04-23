-- Create holders table
CREATE TABLE IF NOT EXISTS holders (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  discord_user_id TEXT UNIQUE NOT NULL,
  address TEXT[] NOT NULL,
  active BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_holders_discord_user_id ON holders(discord_user_id);
CREATE INDEX IF NOT EXISTS idx_holders_active ON holders(active);

-- Add audit columns
ALTER TABLE holders 
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMP WITH TIME ZONE;

-- Create function to automatically update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_holders_updated_at ON holders;
CREATE TRIGGER update_holders_updated_at
    BEFORE UPDATE ON holders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column(); 