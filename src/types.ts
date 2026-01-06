export interface ScanRequest {
    type: 'SCAN_REQUEST';
    text: string;
}

export interface ScanResponse {
    success: boolean;
    data?: FactCheckResult[];
    error?: string;
}

export interface FactCheckResult {
    quote: string;
    verdict: 'true' | 'false' | 'context';
    claim: string;
    comments: string;
    source: string;
}

export interface IntegrityScore {
    domain: string;
    totalClaims: number;
    falseClaims: number;
    score: number;
}
