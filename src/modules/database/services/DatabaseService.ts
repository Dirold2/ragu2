import { PrismaClient } from "@prisma/client";
import type { DatabaseExports } from "../types/index.js";

export class DatabaseService implements DatabaseExports {
	private static instance: DatabaseService;
	private prismaClient: PrismaClient;

	private constructor(prismaClient: PrismaClient) {
		this.prismaClient = prismaClient;
	}

	public static initialize(prismaClient: PrismaClient): DatabaseService {
		if (!DatabaseService.instance) {
			DatabaseService.instance = new DatabaseService(prismaClient);
		}
		return DatabaseService.instance;
	}

	public getPrismaClient(): PrismaClient {
		return this.prismaClient;
	}
}
