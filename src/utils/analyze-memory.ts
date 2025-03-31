#!/usr/bin/env node

import { ModuleManager } from "../core/ModuleManager.js";
import { createLogger } from "../utils/logger.js";
import { config } from "dotenv";

// Загрузить переменные окружения
config();

const logger = createLogger("MemoryAnalyzer");

async function main() {
	logger.info("Запуск анализа памяти...");

	// Создать экземпляр ModuleManager
	const moduleManager = new ModuleManager({
		autoStart: false,
	});

	try {
		// Загрузить и инициализировать модули
		await moduleManager.loadModules();
		await moduleManager.initializeModules();

		// Получить инспектор памяти
		const memoryInspector = moduleManager.getMemoryInspector();

		// Сделать начальный снимок
		memoryInspector.takeSnapshot();

		logger.info("Начальный снимок сделан. Ожидание работы модулей...");

		// Подождать, пока модули поработают некоторое время
		await new Promise((resolve) => setTimeout(resolve, 60000)); // 1 минута

		// Сделать еще один снимок
		memoryInspector.takeSnapshot();

		// Проанализировать использование памяти
		const results = memoryInspector.analyzeMemoryUsage();

		if (results.length === 0) {
			logger.info("Утечек памяти не обнаружено в начальном анализе.");
		}

		// Сгенерировать полный отчет
		const report = memoryInspector.generateMemoryReport();

		logger.info("Отчет о памяти:");
		logger.info(
			`Всего используется кучи: ${report.totalHeapUsed.toFixed(2)} МБ`,
		);
		logger.info(`Всего выделено кучи: ${report.totalHeapTotal.toFixed(2)} МБ`);
		logger.info("Статистика по модулям:");

		report.moduleStats.forEach((stat: any) => {
			logger.info(
				`- ${stat.moduleName}: ${stat.growthRate.toFixed(2)} МБ/час (вероятность утечки: ${stat.leakProbability})`,
			);
		});

		// Остановить модули
		await moduleManager.stopModules();

		logger.info("Анализ памяти завершен.");
	} catch (error) {
		logger.error("Ошибка во время анализа памяти:", error);
	}
}

main().catch((error) => {
	logger.error("Необработанная ошибка:", error);
	process.exit(1);
});
