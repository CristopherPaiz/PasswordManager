import { createClient, Client } from '@libsql/client'

export class DatabaseService {
  private static instance: DatabaseService
  private client: Client | null = null

  private constructor() {}

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService()
    }
    return DatabaseService.instance
  }

  public async connect(): Promise<Client> {
    if (this.client) {
      return this.client
    }

    const url = process.env.TURSO_DATABASE_URL
    const authToken = process.env.TURSO_AUTH_TOKEN

    if (!url || !authToken) {
      throw new Error('Variables de entorno de base de datos faltantes')
    }

    this.client = createClient({ url, authToken })
    return this.client
  }

  public async getClient(): Promise<Client> {
    if (!this.client) {
      return this.connect()
    }
    return this.client
  }
}
