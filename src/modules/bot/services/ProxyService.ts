import { HttpsProxyAgent } from "https-proxy-agent";
import { bot } from "../bot.js";
export default class ProxyService {
	private proxyAgent: HttpsProxyAgent<string> | null = null;
	private proxyEnabled = false;
	private readonly logger = bot.logger;

	constructor() {
		this.initializeProxy();
	}

	private initializeProxy(): void {
		const proxyUrl = process.env.PROXY_URL;
		if (proxyUrl) {
			try {
				this.proxyAgent = new HttpsProxyAgent(proxyUrl);
				this.proxyEnabled = true;
				this.logger.info("Proxy initialized successfully");
			} catch (error) {
				this.logger.error(`Error initializing proxy: ${error}`);
			}
		}
	}

	public getProxyAgent(): HttpsProxyAgent<string> | null {
		return this.proxyEnabled ? this.proxyAgent : null;
	}

	public isProxyEnabled(): boolean {
		return this.proxyEnabled;
	}

	public getProxyOptions(): { agent: HttpsProxyAgent<string> } | {} {
		return this.proxyEnabled && this.proxyAgent
			? { agent: this.proxyAgent }
			: {};
	}
}
