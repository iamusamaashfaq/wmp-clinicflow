export const PLATFORM_SCHEMA=`
CREATE TABLE IF NOT EXISTS platform_users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,role TEXT NOT NULL,salt TEXT NOT NULL,password_hash TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS platform_sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS platform_clinics(id TEXT PRIMARY KEY,slug TEXT NOT NULL UNIQUE,name TEXT NOT NULL,doctor TEXT NOT NULL,specialty TEXT NOT NULL,address TEXT NOT NULL,phone TEXT NOT NULL,email TEXT NOT NULL,fee INTEGER NOT NULL,status TEXT NOT NULL,plan TEXT NOT NULL,subscription_end TEXT NOT NULL,amount INTEGER NOT NULL DEFAULT 0,reception_username TEXT NOT NULL,reception_salt TEXT NOT NULL,reception_hash TEXT NOT NULL,created INTEGER NOT NULL,updated INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS platform_audit(id TEXT PRIMARY KEY,actor TEXT NOT NULL,action TEXT NOT NULL,clinic_id TEXT,at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS tenant_clinic_state(clinic_id TEXT PRIMARY KEY,value TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS tenant_staff_sessions(clinic_id TEXT NOT NULL,token TEXT PRIMARY KEY,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS tenant_subscribers(clinic_id TEXT NOT NULL,id TEXT PRIMARY KEY,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS tenant_integration(clinic_id TEXT PRIMARY KEY,sent INTEGER NOT NULL DEFAULT 0,received INTEGER NOT NULL DEFAULT 0,last_delivery INTEGER,error TEXT);
CREATE INDEX IF NOT EXISTS tenant_subscribers_clinic ON tenant_subscribers(clinic_id,expires);
CREATE INDEX IF NOT EXISTS tenant_staff_clinic ON tenant_staff_sessions(clinic_id,expires);
`;
const initialized=new WeakSet();
export async function ensurePlatform(db){if(initialized.has(db))return;try{await db.prepare('SELECT id FROM platform_users LIMIT 1').first();}catch{throw Object.assign(Error('Clinic platform database is updating. Please retry after deployment finishes.'),{status:503});}initialized.add(db);}
