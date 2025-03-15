import type { PrismaClient } from "@prisma/client";

export interface DatabaseExports {
	getPrismaClient: () => PrismaClient;
}