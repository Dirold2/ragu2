import { PrismaClient } from "#prisma/default.js";

type DatabaseExports = {
	getPrismaClient: () => PrismaClient;
};

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
