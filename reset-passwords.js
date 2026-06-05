import { MongoClient } from 'mongodb';
import crypto from 'node:crypto';
import dotenv from 'dotenv';

// Load .env file
dotenv.config();

// Configuration
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB;

if (!MONGODB_URI || !MONGODB_DB) {
  console.error('✗ Error: MONGODB_URI and MONGODB_DB must be set in .env file');
  process.exit(1);
}

// Password hashing (same as server/utils/auth.ts)
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `s1$${salt.toString('base64')}$${hash.toString('base64')}`;
}

// Generate secure random password
function genPassword() {
  return crypto.randomBytes(9).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function resetPasswords() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    console.log('✓ Connected to MongoDB');
    
    const db = client.db(MONGODB_DB);
    const users = await db.collection('users').find({}).toArray();
    
    if (users.length === 0) {
      console.log('⚠ No users found in database');
      return;
    }
    
    console.log(`\nResetting passwords for ${users.length} user(s):\n`);
    
    const results = [];
    
    for (const user of users) {
      const tempPassword = genPassword();
      const passwordHash = hashPassword(tempPassword);
      
      await db.collection('users').updateOne(
        { _id: user._id },
        { $set: { passwordHash } }
      );
      
      results.push({
        email: user.email,
        name: user.name,
        role: user.role,
        tempPassword
      });
      
      console.log(`✓ ${user.email}`);
    }
    
    console.log('\n' + '='.repeat(70));
    console.log('TEMPORARY PASSWORDS (save these!):\n');
    
    for (const r of results) {
      console.log(`${r.email.padEnd(30)} | Role: ${r.role.padEnd(7)} | Password: ${r.tempPassword}`);
    }
    
    console.log('='.repeat(70));
    console.log(`\n✓ All ${users.length} passwords reset successfully!`);
    console.log('Users can now log in with their email and the temporary password above.');
    console.log('They should change their password after first login.');
    
  } catch (error) {
    console.error('✗ Error:', error.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

resetPasswords();
