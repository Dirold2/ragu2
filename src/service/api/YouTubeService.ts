import { Discord } from "discordx";

abstract class SearchService {
    abstract hasAvailableResults(): boolean;
}

interface SearchTrackResult {
    id: number;
    title: string;
    artists: Array<{ name: string }>;
    albums: Array<{ title: string }>;
}

@Discord()
class YouTubeService extends SearchService {
    private results: SearchTrackResult[] | undefined;

    setResults(results: SearchTrackResult[]) {
        this.results = results;
    }

    hasAvailableResults(): boolean {
        return this.results !== undefined && this.results.length > 0;
    }
    
    public async searchName(trackName: string): Promise<SearchTrackResult[]> {
        console.log(trackName)
        return []
    }
}

export { YouTubeService }