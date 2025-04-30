-- Create function to automatically update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create holders table
CREATE TABLE IF NOT EXISTS holders (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL,
    discord_user_id TEXT NOT NULL,
    addresses TEXT[] NOT NULL,
    active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    server_id TEXT NOT NULL,
    updated_at TEXT,
    last_verified_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(discord_user_id, server_id)
);

-- Create indexes for holders table
CREATE INDEX holders_discord_id_idx ON holders(discord_user_id);
CREATE INDEX holders_active_idx ON holders(active);

-- Create trigger for holders table
CREATE TRIGGER update_holders_updated_at
    BEFORE UPDATE ON holders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create servers table
CREATE TABLE IF NOT EXISTS servers (
    server_id TEXT PRIMARY KEY,
    server_name TEXT NOT NULL,
    token_address TEXT NOT NULL,
    required_balance INTEGER NOT NULL,
    role_id TEXT NOT NULL,
    rpc_url TEXT NOT NULL,
    setup_complete BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    admin_user_id TEXT,
    token_symbol TEXT,
    token_decimals BIGINT,
    updated_at TIMESTAMP WITH TIME ZONE
);

-- Create tips table
CREATE TABLE IF NOT EXISTS tips (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    sender TEXT NOT NULL,
    receiver TEXT NOT NULL,
    amount BIGINT NOT NULL,
    decimals INTEGER NOT NULL,
    status TEXT NOT NULL,
    tax_id TEXT
);

-- Create indexes for tips table
CREATE INDEX tips_sender_idx ON tips(sender);
CREATE INDEX tips_receiver_idx ON tips(receiver);
CREATE INDEX tips_status_idx ON tips(status);

-- Create vaults table
CREATE TABLE IF NOT EXISTS vaults (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    discord_user_id TEXT NOT NULL,
    vault_id TEXT NOT NULL,
    amount BIGINT NOT NULL,
    decimals INTEGER NOT NULL,
    token_account TEXT,
    vaults TEXT,
    UNIQUE(discord_user_id, vault_id)
);

-- Create indexes for vaults table
CREATE INDEX vaults_discord_user_id_idx ON vaults(discord_user_id);
CREATE INDEX vaults_vault_id_idx ON vaults(vault_id);
CREATE UNIQUE INDEX vaults_vault_id_unique_idx ON vaults(vault_id);

-- Grant permissions
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;