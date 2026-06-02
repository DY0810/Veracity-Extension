export interface ScanRequest {
    type: 'SCAN_REQUEST';
    text: string;
}

export interface ScanResponse {
    success: boolean;
    data?: FactCheckResult[];
    error?: string;
}

export type FactCheckVerdict = 'true' | 'false' | 'context' | 'unverified';

export interface FactCheckResult {
    quote: string;
    verdict: FactCheckVerdict;
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
