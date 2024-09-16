import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const createLogger = () => {
    const logger = winston.createLogger({
      level: 'info',
      levels: {
        error: 0,
        warn: 1,
        info: 2,
        verbose: 3,
        debug: 4,
        silly: 5
      },
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.colorize(),
        winston.format.json(),
        winston.format.printf(info => {
          return `${info.level}: ${info.message} | ${info.timestamp}`;
        })
      ),
      transports: [
        new DailyRotateFile({
          filename: 'logs/application-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          zippedArchive: true,
          maxSize: '20m',
          maxFiles: '14d'
        }),
      ],
    });

    if (process.env.NODE_ENV !== 'production') {
        logger.add(new winston.transports.Console({
            format: winston.format.simple()
        }));
    }

    return logger;
};

const logger = createLogger();

export default logger;