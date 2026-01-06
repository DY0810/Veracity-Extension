import React, { useState, useEffect } from 'react';
import { Settings, Circle } from 'lucide-react';

const App: React.FC = () => {
  const [status, setStatus] = useState<'idle' | 'scanning' | 'complete' | 'error'>('idle');
  const [claimCount, setClaimCount] = useState(0);
  const [hasApiKey, setHasApiKey] = useState(false);

  useEffect(() => {
    chrome.storage.sync.get(['perplexityApiKey'], (result) => {
      setHasApiKey(!!result.perplexityApiKey);
    });
  }, []);

  const handleScan = () => {
    setStatus('scanning');

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'TRIGGER_SCAN' }, (response) => {
          if (chrome.runtime.lastError) {
            setStatus('error');
          } else if (response?.success) {
            setStatus('complete');
            setClaimCount(response.count || 0);
          } else {
            setStatus('error');
          }
        });
      }
    });
  };

  return (
    <div style={{
      width: '350px',
      backgroundColor: '#FAFAFA',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 20px',
        borderBottom: '1px solid #E5E7EB'
      }}>
        <h1 style={{
          fontSize: '18px',
          fontWeight: '600',
          color: '#333',
          margin: 0,
          letterSpacing: '-0.01em'
        }}>Veracity</h1>
        <button
          onClick={() => chrome.runtime.openOptionsPage()}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#6B7280',
            padding: '4px',
            display: 'flex',
            alignItems: 'center'
          }}
        >
          <Settings size={18} />
        </button>
      </div>

      {/* Main Content */}
      <div style={{
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}>
        {/* Status Badge */}
        {!hasApiKey ? (
          <div style={{
            padding: '12px 16px',
            backgroundColor: '#FEF3C7',
            border: '1px solid #FDE68A',
            borderRadius: '8px',
            fontSize: '13px',
            color: '#92400E',
            textAlign: 'center'
          }}>
            ⚠️ API Key Required
          </div>
        ) : status === 'idle' ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 16px',
            backgroundColor: '#EFF6FF',
            border: '1px solid #DBEAFE',
            borderRadius: '8px',
            fontSize: '13px',
            color: '#1E40AF'
          }}>
            <Circle size={8} fill="#2563EB" color="#2563EB" />
            Ready to Scan
          </div>
        ) : status === 'scanning' ? (
          <div style={{
            padding: '12px 16px',
            backgroundColor: '#EFF6FF',
            border: '1px solid #DBEAFE',
            borderRadius: '8px',
            fontSize: '13px',
            color: '#1E40AF',
            textAlign: 'center'
          }}>
            Analyzing claims...
          </div>
        ) : status === 'complete' ? (
          <div style={{
            padding: '12px 16px',
            backgroundColor: '#D1FAE5',
            border: '1px solid #A7F3D0',
            borderRadius: '8px',
            fontSize: '13px',
            color: '#065F46',
            textAlign: 'center'
          }}>
            ✓ Found {claimCount} claims
          </div>
        ) : (
          <div style={{
            padding: '12px 16px',
            backgroundColor: '#FEE2E2',
            border: '1px solid #FECACA',
            borderRadius: '8px',
            fontSize: '13px',
            color: '#991B1B',
            textAlign: 'center'
          }}>
            Scan failed
          </div>
        )}

        {/* Action Button */}
        {!hasApiKey ? (
          <button
            onClick={() => chrome.runtime.openOptionsPage()}
            style={{
              height: '44px',
              backgroundColor: '#2563EB',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
              transition: 'background-color 0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1D4ED8'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#2563EB'}
          >
            Configure API Key
          </button>
        ) : (
          <button
            onClick={handleScan}
            disabled={status === 'scanning'}
            style={{
              height: '44px',
              backgroundColor: status === 'scanning' ? '#9CA3AF' : '#2563EB',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: status === 'scanning' ? 'not-allowed' : 'pointer',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
              transition: 'background-color 0.2s'
            }}
            onMouseOver={(e) => {
              if (status !== 'scanning') {
                e.currentTarget.style.backgroundColor = '#1D4ED8';
              }
            }}
            onMouseOut={(e) => {
              if (status !== 'scanning') {
                e.currentTarget.style.backgroundColor = '#2563EB';
              }
            }}
          >
            {status === 'scanning' ? 'Scanning...' : 'Fact Check Page'}
          </button>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '8px 20px',
        borderTop: '1px solid #E5E7EB',
        textAlign: 'center',
        fontSize: '10px',
        color: '#9CA3AF',
        textTransform: 'uppercase',
        letterSpacing: '0.05em'
      }}>
        Powered by Perplexity AI
      </div>
    </div>
  );
};

export default App;
