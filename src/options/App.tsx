import React, { useState, useEffect } from 'react';
import { ShieldCheck, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import {
    createPerplexityAuthHeader,
    createPerplexityValidationBody,
    formatPerplexityErrorMessage,
    normalizeApiKey,
} from '../lib/perplexity';

const App: React.FC = () => {
    const [apiKey, setApiKey] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');

    useEffect(() => {
        chrome.storage.sync.get(['perplexityApiKey'], (result: { perplexityApiKey?: string }) => {
            if (result.perplexityApiKey) {
                setApiKey(result.perplexityApiKey);
                setStatus('success');
                setMessage('API Key configured successfully');
            }
        });
    }, []);

    const handleSave = async () => {
        const trimmedApiKey = normalizeApiKey(apiKey);

        if (!trimmedApiKey) {
            setStatus('error');
            setMessage('Please enter an API key');
            return;
        }

        setStatus('loading');
        setMessage('');

        try {
            const response = await fetch(
                'https://api.perplexity.ai/chat/completions',
                {
                    method: 'POST',
                    headers: {
                        'Authorization': createPerplexityAuthHeader(trimmedApiKey),
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(createPerplexityValidationBody()),
                }
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const providerMessage = typeof errorData.error?.message === 'string'
                    ? errorData.error.message
                    : undefined;
                throw new Error(formatPerplexityErrorMessage(response.status, providerMessage));
            }

            chrome.storage.sync.set({ perplexityApiKey: trimmedApiKey }, () => {
                setApiKey(trimmedApiKey);
                setStatus('success');
                setMessage('Configuration saved successfully');
            });
        } catch (error) {
            setStatus('error');
            setMessage(error instanceof Error ? error.message : 'Unable to validate the Perplexity API key.');
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            backgroundColor: '#F3F4F6',
            fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
        }}>
            {/* The Box - Centered Card */}
            <div style={{
                width: '100%',
                maxWidth: '450px',
                backgroundColor: '#FFFFFF',
                borderRadius: '12px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                padding: '2.5rem'
            }}>
                {/* Header - Centered */}
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '56px',
                        height: '56px',
                        backgroundColor: '#EFF6FF',
                        borderRadius: '12px',
                        marginBottom: '1rem'
                    }}>
                        <ShieldCheck size={28} color="#2563EB" />
                    </div>
                    <h1 style={{
                        fontSize: '24px',
                        fontWeight: '700',
                        color: '#111827',
                        margin: 0,
                        fontFamily: 'Inter, system-ui, sans-serif'
                    }}>
                        Connect Veracity
                    </h1>
                    <p style={{
                        fontSize: '14px',
                        color: '#6B7280',
                        margin: '0.5rem 0 0 0',
                        lineHeight: '1.5'
                    }}>
                        Enter your Perplexity API key to enable fact-checking
                    </p>
                </div>

                {/* Input Section */}
                <div style={{ marginBottom: '1.25rem' }}>
                    <label style={{
                        display: 'block',
                        fontSize: '11px',
                        fontWeight: '700',
                        color: '#374151',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        marginBottom: '0.5rem',
                        textAlign: 'left'
                    }}>
                        API Secret Key
                    </label>
                    <input
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSave()}
                        placeholder="pplx-..."
                        style={{
                            width: '100%',
                            padding: '12px',
                            fontSize: '14px',
                            fontFamily: 'monospace',
                            color: '#111827',
                            backgroundColor: '#FFFFFF',
                            border: '1px solid #E5E7EB',
                            borderRadius: '8px',
                            outline: 'none',
                            transition: 'border-color 0.2s, box-shadow 0.2s',
                            boxSizing: 'border-box'
                        }}
                        onFocus={(e) => {
                            e.currentTarget.style.borderColor = '#2563EB';
                            e.currentTarget.style.boxShadow = '0 0 0 3px rgba(37, 99, 235, 0.1)';
                        }}
                        onBlur={(e) => {
                            e.currentTarget.style.borderColor = '#E5E7EB';
                            e.currentTarget.style.boxShadow = 'none';
                        }}
                    />
                </div>

                {/* Save Button */}
                <button
                    onClick={handleSave}
                    disabled={status === 'loading'}
                    style={{
                        width: '100%',
                        padding: '12px',
                        marginTop: '20px',
                        backgroundColor: status === 'loading' ? '#9CA3AF' : '#111827',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '15px',
                        fontWeight: '500',
                        cursor: status === 'loading' ? 'not-allowed' : 'pointer',
                        transition: 'background-color 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px'
                    }}
                    onMouseOver={(e) => {
                        if (status !== 'loading') {
                            e.currentTarget.style.backgroundColor = '#000000';
                        }
                    }}
                    onMouseOut={(e) => {
                        if (status !== 'loading') {
                            e.currentTarget.style.backgroundColor = '#111827';
                        }
                    }}
                >
                    {status === 'loading' ? (
                        <>
                            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                            Saving...
                        </>
                    ) : (
                        'Save Configuration'
                    )}
                </button>

                {/* Status Message */}
                {message && status !== 'idle' && status !== 'loading' && (
                    <div style={{
                        marginTop: '1rem',
                        padding: '12px',
                        backgroundColor: status === 'success' ? '#D1FAE5' : '#FEE2E2',
                        border: `1px solid ${status === 'success' ? '#A7F3D0' : '#FECACA'}`,
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '13px',
                        color: status === 'success' ? '#065F46' : '#991B1B'
                    }}>
                        {status === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                        {message}
                    </div>
                )}

                {/* Footer Link - Bottom Centered */}
                <div style={{
                    marginTop: '2rem',
                    textAlign: 'center'
                }}>
                    <a
                        href="https://www.perplexity.ai/settings/api"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            fontSize: '12px',
                            color: '#6B7280',
                            textDecoration: 'none',
                            transition: 'color 0.2s'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.color = '#2563EB'}
                        onMouseOut={(e) => e.currentTarget.style.color = '#6B7280'}
                    >
                        Don't have a key? Get one here →
                    </a>
                </div>
            </div>

            <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
        </div>
    );
};

export default App;
