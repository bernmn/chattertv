import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@shared/schema';

// Default to memory storage if DATABASE_URL is not available
let queryClient: postgres.Sql;
let db: ReturnType<typeof drizzle>;

if (!process.env.DATABASE_URL) {
  console.warn("DATABASE_URL not found. Using in-memory storage or falling back to alternative connection.");
  
  // We'll initialize an empty db instance that will be replaced with MemStorage in storage.ts
  // This allows the code to run without crashing when DATABASE_URL is missing
  const dummyClient = {} as postgres.Sql;
  db = drizzle(dummyClient, { schema });
} else {
  // Create a PostgreSQL client with the connection string
  const connectionString = process.env.DATABASE_URL;
  console.log("Connecting to database...");

  try {
    // Log database connection - hide credentials
    const maskedUrl = connectionString.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:****@');
    console.log(`Database URL: ${maskedUrl}`);

    // Create Postgres client with debug mode
    queryClient = postgres(connectionString, { 
      max: 10,
      idle_timeout: 30,
      connect_timeout: 10
    });

    // Create a drizzle database instance
    db = drizzle(queryClient, { schema });
  } catch (error) {
    console.error("Failed to connect to database:", error);
    throw error;
  }
}

export { db };